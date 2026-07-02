// Truth-kernel + runtime self-model data types (from truthKernelService.ts) — firebase-free.
// CompanionRuntimeSelfModel is one of the two values injected into generateAIResponse.
// Builder INPUT types (TruthKernelUserRecordInput etc.) stay with the builder in Tier E.
// DEPENDENCY RULE: data types → shared-types; logic → aria-core; one-way (aria-core→shared-types).

export type TruthKernelVersion = 'truth-kernel.v1';
export type TruthRuntimeSource = 'resolved' | 'fallback';

export type TruthSourceKind =
  | 'user_document'
  | 'subscription_document'
  | 'memory'
  | 'settings'
  | 'location_context'
  | 'derived'
  | 'explicit'
  | 'fallback'
  | 'unknown';

export interface TruthSourceRef {
  kind: TruthSourceKind;
  field?: string;
  path?: string;
  note?: string;
}

export type TruthStatus = 'known' | 'unknown';
export type TruthAvailability = 'available' | 'unavailable' | 'unknown';
export type TruthMode = 'enabled' | 'disabled' | 'unknown';
export type TruthAccessTier = 'free' | 'regular' | 'ultra' | 'unknown';
export type TruthAccessModel = 'single_subscription' | 'tiered' | 'unknown';
export type TruthLocationPrecision = 'exact' | 'city_level' | 'approximate' | 'unknown';

export interface TruthSignal<T> {
  value: T | null;
  status: TruthStatus;
  source: TruthSourceRef;
  derivedFrom?: TruthSourceRef;
}

export interface TruthTimezoneState {
  offsetMinutes: TruthSignal<number>;
  name: TruthSignal<string>;
  label: string;
  source: TruthSourceRef;
}

export interface TruthSubscriptionAccessState {
  tier: TruthSignal<TruthAccessTier>;
  accessModel: TruthSignal<TruthAccessModel>;
  source: TruthSourceRef;
}

export interface TruthFeatureState {
  name: 'voice' | 'camera';
  availability: TruthAvailability;
  enabled: TruthSignal<boolean>;
  activeNow: TruthSignal<boolean>;
  source: TruthSourceRef;
  note?: string;
}

export interface TruthLocationAwarenessState {
  availability: TruthAvailability;
  enabled: TruthSignal<boolean>;
  precision: TruthLocationPrecision;
  freshSnapshotAvailable: TruthSignal<boolean>;
  storesLocationHistory: TruthSignal<boolean>;
  usesApproximateContext: TruthSignal<boolean>;
  source: TruthSourceRef;
}

export interface TruthKernelSources {
  profileDisplayName: TruthSourceRef;
  relationshipDays: TruthSourceRef;
  timezone: TruthSourceRef;
  subscription: TruthSourceRef;
  proactiveEnabled: TruthSourceRef;
  freeModeEnabled: TruthSourceRef;
  locationAwareness: TruthSourceRef;
  voice: TruthSourceRef;
  camera: TruthSourceRef;
}

export interface TruthKernel {
  version: TruthKernelVersion;
  runtimeSource: TruthRuntimeSource;
  sources: TruthKernelSources;
  profileDisplayName: TruthSignal<string>;
  relationshipDays: TruthSignal<number>;
  timezone: TruthTimezoneState;
  subscription: TruthSubscriptionAccessState;
  proactiveEnabled: TruthSignal<boolean>;
  freeModeEnabled: TruthSignal<boolean>;
  locationAwareness: TruthLocationAwarenessState;
  voice: TruthFeatureState;
  camera: TruthFeatureState;
}

export type CompanionSubscriptionTier = 'free' | 'regular' | 'ultra';

export interface CompanionRuntimeSelfModel {
  relationshipDays: number;
  subscriptionTier: CompanionSubscriptionTier;
  hasVoiceAccess: boolean | null;
  hasVisionAccess: boolean | null;
  proactiveEnabled: boolean | null;
  freeModeEnabled: boolean | null;
  runtimeSource: 'resolved' | 'fallback';
  profileDisplayName?: string;
  userTimeZoneOffsetMinutes: number;
  userTimeZoneName?: string;
  truthKernel: TruthKernel;
}
