// Voice following for the recording island: listens to the take's microphone with Apple's speech recognizer, on this Mac only
// (requiresOnDeviceRecognition), and reports what it hears as JSON lines. The island matches the words to the script.
// Borumi's follower does the same with its own engines (Whisper, Apple Speech); this is the on-device Apple one.
//
// stdin, one JSON object a line: {"command":"status"} | {"command":"authorize"} | {"command":"start","microphone":"…","text":"…"} | {"command":"stop"}
// stdout: {"type":"status","authorization":"authorized|denied|restricted|notDetermined","available":bool}
//         {"type":"started","locale":"en-US"} {"type":"reset"} {"type":"words","text":"…"} {"type":"stopped"} {"type":"error","message":"…"}
import AVFoundation
import Foundation
import NaturalLanguage
import Speech

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data: data, encoding: .utf8) else { return }
    print(line)
}

func authorizationName(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    default: return "notDetermined"
    }
}

/// The recognizer's language: the script's own (NaturalLanguage), in the region the person prefers when this Mac can recognize it on-device.
func recognitionLocale(for text: String) -> Locale? {
    let recognizer = NLLanguageRecognizer()
    recognizer.processString(String(text.prefix(5000)))
    let language = recognizer.dominantLanguage?.rawValue ?? Locale.current.language.languageCode?.identifier ?? "en"
    let supported = SFSpeechRecognizer.supportedLocales()
    func onDevice(_ identifier: String) -> Locale? {
        let locale = Locale(identifier: identifier)
        guard supported.contains(where: { $0.identifier.replacingOccurrences(of: "_", with: "-") == identifier.replacingOccurrences(of: "_", with: "-") }) else { return nil }
        return SFSpeechRecognizer(locale: locale)?.supportsOnDeviceRecognition == true ? locale : nil
    }
    let code = { (identifier: String) in identifier.replacingOccurrences(of: "_", with: "-").split(separator: "-").first.map(String.init) ?? identifier }
    var candidates = Locale.preferredLanguages.filter { code($0) == language }
    if let region = Locale.current.region?.identifier { candidates.append("\(language)-\(region)") }
    candidates += supported.map { $0.identifier.replacingOccurrences(of: "_", with: "-") }.filter { code($0) == language }.sorted()
    for identifier in candidates { if let locale = onDevice(identifier) { return locale } }
    return nil
}

/// A few of the script's longer words help the recognizer with names and terms it would otherwise miss.
func contextualStrings(from text: String) -> [String] {
    var seen = Set<String>(), out: [String] = []
    for word in text.split(whereSeparator: { $0.isWhitespace }) {
        let clean = word.trimmingCharacters(in: .punctuationCharacters.union(.symbols))
        if clean.count >= 6 && !clean.hasPrefix("[") && seen.insert(clean.lowercased()).inserted { out.append(clean) }
        if out.count >= 100 { break }
    }
    return out
}

final class Follower: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let audio = DispatchQueue(label: "speech-follower.audio")
    private let lock = NSLock()
    private var capture: AVCaptureSession?
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var hints: [String] = []
    private var generation = 0
    private var requestStarted = Date()
    private var restarts: [Date] = []

    func status() {
        emit(["type": "status", "authorization": authorizationName(SFSpeechRecognizer.authorizationStatus()), "available": true])
    }

    func authorize() {
        SFSpeechRecognizer.requestAuthorization { _ in DispatchQueue.main.async { self.status() } }
    }

    func start(microphone: String, text: String) {
        stop(report: false)
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else { return fail("Speech Recognition permission is needed to follow your voice.") }
        guard let locale = recognitionLocale(for: text), let recognizer = SFSpeechRecognizer(locale: locale) else {
            return fail("This Mac can't recognize the script's language on-device. Add it in System Settings > Keyboard > Dictation, or use Constant speed.")
        }
        let devices = AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone, .external], mediaType: .audio, position: .unspecified).devices
        guard let device = devices.first(where: { $0.localizedName == microphone }) ?? (microphone.isEmpty ? AVCaptureDevice.default(for: .audio) : nil) else {
            return fail("The microphone '\(microphone)' was not found.")
        }
        let session = AVCaptureSession()
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else { return fail("The microphone could not be opened.") }
            session.addInput(input)
        } catch { return fail("The microphone could not be opened: \(error.localizedDescription)") }
        let output = AVCaptureAudioDataOutput()
        // 16 kHz mono 16-bit: what the recognizer works in, whatever the microphone's own format.
        output.audioSettings = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
                                AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false]
        output.setSampleBufferDelegate(self, queue: audio)
        guard session.canAddOutput(output) else { return fail("The microphone could not be read.") }
        session.addOutput(output)
        self.recognizer = recognizer
        hints = contextualStrings(from: text)
        restarts = []
        capture = session
        begin()
        audio.async { session.startRunning() }
        emit(["type": "started", "locale": locale.identifier.replacingOccurrences(of: "_", with: "-")])
    }

    /// A new recognition request. Each lasts under a minute and starts again when it ends, so a long take keeps being followed.
    private func begin() {
        guard let recognizer, capture != nil else { return }
        generation += 1
        let current = generation
        task?.cancel()
        let next = SFSpeechAudioBufferRecognitionRequest()
        next.requiresOnDeviceRecognition = true
        next.shouldReportPartialResults = true
        next.taskHint = .dictation
        next.addsPunctuation = false
        next.contextualStrings = hints
        lock.lock(); request?.endAudio(); request = next; requestStarted = Date(); lock.unlock()
        emit(["type": "reset"])
        task = recognizer.recognitionTask(with: next) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self, current == self.generation, self.capture != nil else { return }
                if let result { emit(["type": "words", "text": result.bestTranscription.formattedString]) }
                if error != nil || result?.isFinal == true { self.again(after: error) }
            }
        }
    }

    private func again(after error: Error?) {
        let now = Date()
        restarts = restarts.filter { now.timeIntervalSince($0) < 10 } + [now]
        if restarts.count > 8 { return fail("Speech recognition stopped: \(error?.localizedDescription ?? "it ended repeatedly").") }
        begin()
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        lock.lock()
        let current = request, age = Date().timeIntervalSince(requestStarted)
        lock.unlock()
        current?.appendAudioSampleBuffer(sampleBuffer)
        if age > 50 { DispatchQueue.main.async { if self.request === current { self.begin() } } }
    }

    func stop(report: Bool = true) {
        let wasRunning = capture != nil
        generation += 1
        if let session = capture { audio.async { session.stopRunning() } }
        capture = nil
        task?.cancel(); task = nil
        lock.lock(); request?.endAudio(); request = nil; lock.unlock()
        recognizer = nil
        if report && wasRunning { emit(["type": "stopped"]) }
    }

    private func fail(_ message: String) {
        stop(report: false)
        emit(["type": "error", "message": message])
    }
}

let follower = Follower()
Thread.detachNewThread {
    while let line = readLine() {
        guard let data = line.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let command = value["command"] as? String else {
            emit(["type": "error", "message": "Invalid speech follower command."]); continue
        }
        DispatchQueue.main.async {
            switch command {
            case "status": follower.status()
            case "authorize": follower.authorize()
            case "start": follower.start(microphone: value["microphone"] as? String ?? "", text: value["text"] as? String ?? "")
            case "stop": follower.stop()
            default: emit(["type": "error", "message": "Unknown speech follower command."])
            }
        }
    }
    DispatchQueue.main.async { follower.stop(report: false); exit(0) }
}
dispatchMain()
