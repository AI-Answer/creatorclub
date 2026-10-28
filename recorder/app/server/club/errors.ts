/** An error whose message is safe to show to the user. */
export class ClubError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'ClubError';
  }
}

export const notFound = (what: string) => new ClubError(`That ${what} was not found.`, 404);

export const GENERIC_FAILURE = 'That did not work.';

/** The sentence to show for any thrown value; raw errors never leave the server. */
export const userMessage = (error: unknown): string => (error instanceof ClubError ? error.message : GENERIC_FAILURE);
