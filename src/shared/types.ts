export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export type Nullable<T> = T | null;
