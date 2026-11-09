export const RECORDING_STATUSES:readonly ['idle','ready','starting','recording','paused','saving'];
export type RecordingStatus=typeof RECORDING_STATUSES[number];
