// Branded types for domain modeling — prevents accidental assignment between
// semantically-different primitives (e.g., epoch-ms vs pressure 0..1).
// Per Total TypeScript (Pocock, 2026): branded types make the type system
// enforce domain semantics without runtime cost.
//
// DEPENDENCY RULE: data types → shared-types; logic → aria-core.

declare const EpochMsBrand: unique symbol;
/** Unix epoch milliseconds. Branded to prevent accidental assignment to bare `number`. */
export type EpochMs = number & { readonly [EpochMsBrand]: true };

declare const IsoDateBrand: unique symbol;
/** ISO-8601 date string (e.g., "2026-06-27"). */
export type IsoDate = string & { readonly [IsoDateBrand]: true };

declare const UserIdBrand: unique symbol;
/** Firebase Auth uid (28-char). */
export type UserId = string & { readonly [UserIdBrand]: true };

declare const MessageIdBrand: unique symbol;
/** Chat message / turn id. */
export type MessageId = string & { readonly [MessageIdBrand]: true };

// ── Construction helpers (zero runtime cost — pure type assertion) ──────────

/** Assert a `number` is an epoch-ms timestamp. Use at I/O boundaries where you
 *  know the value is epoch-ms (e.g., `Date.now()`, D1 INTEGER column). */
export const asEpochMs = (n: number): EpochMs => n as EpochMs;

/** Assert a `string` is an ISO-8601 date. Use at construction sites. */
export const asIsoDate = (s: string): IsoDate => s as IsoDate;
