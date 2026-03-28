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

export interface TruthCapabilitySnapshotData extends TruthKernel {
  kind: 'truth_capability_snapshot';
}

export interface TruthKernelUserRecordInput {
  displayName?: unknown;
  createdAt?: TruthDateLike;
  timeZoneOffsetMinutes?: unknown;
  timeZoneName?: unknown;
  subscriptionTier?: unknown;
  isPremium?: unknown;
  freeModeEnabled?: unknown;
}

export interface TruthKernelSubscriptionInput {
  tier?: TruthAccessTier | null;
  accessModel?: TruthAccessModel | null;
  source?: TruthSourceRef;
}

export interface TruthKernelLocationInput {
  enabled?: boolean | null;
  freshSnapshotAvailable?: boolean | null;
  precision?: TruthLocationPrecision | null;
  storesLocationHistory?: boolean | null;
  usesApproximateContext?: boolean | null;
  source?: TruthSourceRef;
}

export interface TruthKernelFeatureInput {
  availability?: TruthAvailability | null;
  enabled?: boolean | null;
  activeNow?: boolean | null;
  source?: TruthSourceRef;
  note?: string | null;
}

export interface TruthKernelBuildInput {
  now?: Date;
  runtimeSource?: TruthRuntimeSource;
  userRecord?: TruthKernelUserRecordInput | null;
  memoryProactiveEnabled?: boolean | null;
  subscription?: TruthKernelSubscriptionInput | null;
  location?: TruthKernelLocationInput | null;
  voice?: TruthKernelFeatureInput | null;
  camera?: TruthKernelFeatureInput | null;
}

export type TruthDateLike =
  | Date
  | string
  | number
  | {
      toDate?: () => Date;
    }
  | null
  | undefined;

const TRUTH_KERNEL_VERSION: TruthKernelVersion = 'truth-kernel.v1';

const UNKNOWN_SOURCE: TruthSourceRef = { kind: 'unknown' };

function createSourceRef(
  kind: TruthSourceKind,
  field?: string,
  note?: string,
  path?: string,
): TruthSourceRef {
  const ref: TruthSourceRef = { kind };
  if (field) ref.field = field;
  if (path) ref.path = path;
  if (note) ref.note = note;
  return ref;
}

function normalizeSourceRef(source?: TruthSourceRef | null, fallbackField?: string): TruthSourceRef {
  if (!source) {
    return fallbackField
      ? createSourceRef('unknown', fallbackField, 'source not provided')
      : UNKNOWN_SOURCE;
  }
  return {
    kind: source.kind || 'unknown',
    field: source.field ?? fallbackField,
    path: source.path,
    note: source.note,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function coerceDate(value: TruthDateLike): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value && typeof value.toDate === 'function') {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function coerceFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTruthSignal<T>(
  value: T | null | undefined,
  source: TruthSourceRef,
  options?: {
    derivedFrom?: TruthSourceRef;
  },
): TruthSignal<T> {
  return {
    value: value ?? null,
    status: value === null || value === undefined ? 'unknown' : 'known',
    source,
    ...(options?.derivedFrom ? { derivedFrom: options.derivedFrom } : {}),
  };
}

function resolveTruthySignal(
  value: boolean | null | undefined,
  source: TruthSourceRef,
): TruthSignal<boolean> {
  return resolveTruthSignal<boolean>(typeof value === 'boolean' ? value : null, source);
}

function resolveStringSignal(
  value: unknown,
  source: TruthSourceRef,
): TruthSignal<string> {
  return resolveTruthSignal<string>(isNonEmptyString(value) ? value.trim() : null, source);
}

function resolveNumberSignal(
  value: unknown,
  source: TruthSourceRef,
): TruthSignal<number> {
  return resolveTruthSignal<number>(coerceFiniteNumber(value), source);
}

function resolveSubscriptionTier(
  rawTier: unknown,
  legacyPremium: unknown,
): TruthAccessTier {
  const tier = typeof rawTier === 'string' ? rawTier.trim().toLowerCase() : '';
  if (tier === 'free' || tier === 'regular' || tier === 'ultra') {
    return tier;
  }
  if (legacyPremium === true) {
    return 'regular';
  }
  return 'unknown';
}

function resolveAccessModel(
  explicitModel: TruthAccessModel | null | undefined,
  tier: TruthAccessTier,
): TruthAccessModel {
  if (explicitModel && explicitModel !== 'unknown') {
    return explicitModel;
  }
  if (tier !== 'unknown') {
    return 'single_subscription';
  }
  return 'unknown';
}

function formatUtcOffsetLabel(offsetMinutes: number | null): string {
  if (offsetMinutes === null) {
    return 'unknown';
  }
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const totalMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const minutePart = minutes.toString().padStart(2, '0');
  return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutePart}`;
}

function buildTimezoneState(
  offsetMinutes: number | null,
  name: string | null,
  source: TruthSourceRef,
): TruthTimezoneState {
  const offsetSignal = resolveNumberSignal(offsetMinutes, source);
  const nameSignal = resolveStringSignal(name, source);
  const label =
    nameSignal.status === 'known' && offsetSignal.status === 'known'
      ? `${nameSignal.value} (${formatUtcOffsetLabel(offsetSignal.value)})`
      : nameSignal.status === 'known'
        ? nameSignal.value
        : offsetSignal.status === 'known'
          ? formatUtcOffsetLabel(offsetSignal.value)
          : 'unknown';

  return {
    offsetMinutes: offsetSignal,
    name: nameSignal,
    label: label || 'unknown',
    source,
  };
}

function buildLocationAwarenessState(
  location: TruthKernelLocationInput | null | undefined,
): TruthLocationAwarenessState {
  const source = normalizeSourceRef(location?.source, 'location');
  const enabledSignal = resolveTruthySignal(location?.enabled ?? null, source);
  const snapshotSignal = resolveTruthySignal(location?.freshSnapshotAvailable ?? null, source);
  const storesHistorySignal = resolveTruthySignal(location?.storesLocationHistory ?? null, source);
  const approximateSignal = resolveTruthySignal(location?.usesApproximateContext ?? null, source);
  const explicitAvailability = location?.enabled === true ? 'available' : location?.enabled === false ? 'unavailable' : null;
  const availability =
    location?.enabled !== null && location?.enabled !== undefined
      ? explicitAvailability ?? 'unknown'
      : location?.freshSnapshotAvailable !== null && location?.freshSnapshotAvailable !== undefined
        ? location.freshSnapshotAvailable
          ? 'available'
          : 'unavailable'
        : 'unknown';

  return {
    availability,
    enabled: enabledSignal,
    precision: location?.precision ?? 'unknown',
    freshSnapshotAvailable: snapshotSignal,
    storesLocationHistory: storesHistorySignal,
    usesApproximateContext: approximateSignal,
    source,
  };
}

function buildFeatureState(
  name: 'voice' | 'camera',
  feature: TruthKernelFeatureInput | null | undefined,
): TruthFeatureState {
  const source = normalizeSourceRef(feature?.source, name);
  const enabledSignal = resolveTruthySignal(feature?.enabled ?? null, source);
  const activeNowSignal = resolveTruthySignal(feature?.activeNow ?? null, source);
  const availability =
    feature?.availability ??
    (enabledSignal.status === 'known'
      ? enabledSignal.value
        ? 'available'
        : 'unavailable'
      : activeNowSignal.status === 'known'
        ? activeNowSignal.value
          ? 'available'
          : 'unavailable'
        : 'unknown');

  return {
    name,
    availability,
    enabled: enabledSignal,
    activeNow: activeNowSignal,
    source,
    ...(feature?.note ? { note: feature.note } : {}),
  };
}

function buildKernelSources(
  profileDisplayNameSource: TruthSourceRef,
  relationshipDaysSource: TruthSourceRef,
  timezoneSource: TruthSourceRef,
  subscriptionSource: TruthSourceRef,
  proactiveEnabledSource: TruthSourceRef,
  freeModeEnabledSource: TruthSourceRef,
  locationAwarenessSource: TruthSourceRef,
  voiceSource: TruthSourceRef,
  cameraSource: TruthSourceRef,
): TruthKernelSources {
  return {
    profileDisplayName: profileDisplayNameSource,
    relationshipDays: relationshipDaysSource,
    timezone: timezoneSource,
    subscription: subscriptionSource,
    proactiveEnabled: proactiveEnabledSource,
    freeModeEnabled: freeModeEnabledSource,
    locationAwareness: locationAwarenessSource,
    voice: voiceSource,
    camera: cameraSource,
  };
}

function buildRelationshipDays(
  createdAt: TruthDateLike,
  now: Date,
  source: TruthSourceRef,
): TruthSignal<number> {
  const createdDate = coerceDate(createdAt);
  if (!createdDate) {
    return resolveTruthSignal<number>(null, createSourceRef('derived', 'relationshipDays', 'createdAt missing or invalid'), {
      derivedFrom: source,
    });
  }

  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return resolveTruthSignal<number>(days, createSourceRef('derived', 'relationshipDays'), {
    derivedFrom: source,
  });
}

function buildTruthSignalText<T>(
  name: string,
  signal: TruthSignal<T>,
): string[] {
  const lines = [
    `${name}.status=${signal.status}`,
    `${name}.value=${signal.status === 'known' ? stringifyTruthValue(signal.value) : 'unknown'}`,
    `${name}.source=${formatTruthSourceRef(signal.source)}`,
  ];
  if (signal.derivedFrom) {
    lines.push(`${name}.derived_from=${formatTruthSourceRef(signal.derivedFrom)}`);
  }
  return lines;
}

function stringifyTruthValue(value: unknown): string {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function formatTruthSourceRef(source: TruthSourceRef): string {
  const parts: string[] = [source.kind];
  if (source.field) parts.push(source.field);
  if (source.path) parts.push(source.path);
  if (source.note) parts.push(`note:${source.note}`);
  return parts.join('.');
}

export function buildTruthKernelFromRuntimeContext(
  input: TruthKernelBuildInput = {},
): TruthKernel {
  const now = input.now ?? new Date();
  const userRecord = input.userRecord ?? null;
  const runtimeSource = input.runtimeSource ?? (userRecord ? 'resolved' : 'fallback');

  const profileDisplayNameSource = createSourceRef('user_document', 'displayName');
  const createdAtSource = createSourceRef('user_document', 'createdAt');
  const relationshipDaysSource = createSourceRef('derived', 'relationshipDays');
  const timezoneSource = createSourceRef('user_document', 'timeZoneOffsetMinutes');
  const proactiveEnabledSource = createSourceRef('memory', 'proactiveEnabled');
  const freeModeEnabledSource = createSourceRef('user_document', 'freeModeEnabled');
  const locationSource = input.location?.source ?? createSourceRef('location_context', 'enabled');
  const voiceSource = input.voice?.source ?? createSourceRef('unknown', 'voice');
  const cameraSource = input.camera?.source ?? createSourceRef('unknown', 'camera');

  const profileDisplayName = resolveStringSignal(userRecord?.displayName, profileDisplayNameSource);
  const relationshipDays = buildRelationshipDays(userRecord?.createdAt, now, createdAtSource);

  const timezone = buildTimezoneState(
    coerceFiniteNumber(userRecord?.timeZoneOffsetMinutes),
    isNonEmptyString(userRecord?.timeZoneName) ? userRecord.timeZoneName.trim() : null,
    timezoneSource,
  );

  const tier = input.subscription?.tier ?? resolveSubscriptionTier(userRecord?.subscriptionTier, userRecord?.isPremium);
  const subscriptionTierSource = input.subscription?.source ?? createSourceRef('subscription_document', 'subscriptionTier');
  const subscriptionTierSignal = resolveTruthSignal<TruthAccessTier>(tier ?? 'unknown', subscriptionTierSource);
  const accessModel = resolveAccessModel(input.subscription?.accessModel, subscriptionTierSignal.value ?? 'unknown');
  const accessModelSignal = resolveTruthSignal<TruthAccessModel>(accessModel, subscriptionTierSource);

  const proactiveEnabled = resolveTruthySignal(
    input.memoryProactiveEnabled ?? null,
    proactiveEnabledSource,
  );

  const freeModeEnabled = resolveTruthySignal(
    typeof userRecord?.freeModeEnabled === 'boolean' ? userRecord.freeModeEnabled : null,
    freeModeEnabledSource,
  );

  const locationInput: TruthKernelLocationInput = {
    enabled: input.location?.enabled ?? null,
    freshSnapshotAvailable: input.location?.freshSnapshotAvailable ?? null,
    precision: input.location?.precision ?? null,
    storesLocationHistory: input.location?.storesLocationHistory ?? null,
    usesApproximateContext: input.location?.usesApproximateContext ?? null,
    source: locationSource,
  };
  const voiceInput: TruthKernelFeatureInput = {
    availability: input.voice?.availability ?? null,
    enabled: input.voice?.enabled ?? null,
    activeNow: input.voice?.activeNow ?? null,
    source: voiceSource,
    note: input.voice?.note ?? null,
  };
  const cameraInput: TruthKernelFeatureInput = {
    availability: input.camera?.availability ?? null,
    enabled: input.camera?.enabled ?? null,
    activeNow: input.camera?.activeNow ?? null,
    source: cameraSource,
    note: input.camera?.note ?? null,
  };

  const locationAwareness = buildLocationAwarenessState(locationInput);
  const voice = buildFeatureState('voice', voiceInput);
  const camera = buildFeatureState('camera', cameraInput);

  return {
    version: TRUTH_KERNEL_VERSION,
    runtimeSource,
    sources: buildKernelSources(
      profileDisplayNameSource,
      relationshipDaysSource,
      timezoneSource,
      subscriptionTierSource,
      proactiveEnabledSource,
      freeModeEnabledSource,
      locationAwareness.source,
      voice.source,
      camera.source,
    ),
    profileDisplayName,
    relationshipDays,
    timezone,
    subscription: {
      tier: subscriptionTierSignal,
      accessModel: accessModelSignal,
      source: subscriptionTierSource,
    },
    proactiveEnabled,
    freeModeEnabled,
    locationAwareness,
    voice,
    camera,
  };
}

export function buildTruthCapabilitySnapshotData(
  kernel: TruthKernel,
): TruthCapabilitySnapshotData {
  return {
    kind: 'truth_capability_snapshot',
    ...kernel,
  };
}

export function buildDeterministicCapabilitySnapshotText(
  kernel: TruthKernel,
): string {
  const snapshot = buildTruthCapabilitySnapshotData(kernel);
  const lines: string[] = [
    `kind=${snapshot.kind}`,
    `version=${snapshot.version}`,
    `runtime_source=${snapshot.runtimeSource}`,
  ];

  lines.push(...buildTruthSignalText('profile_display_name', snapshot.profileDisplayName));
  lines.push(...buildTruthSignalText('relationship_days', snapshot.relationshipDays));
  lines.push(...buildTruthSignalText('timezone_offset_minutes', snapshot.timezone.offsetMinutes));
  lines.push(...buildTruthSignalText('timezone_name', snapshot.timezone.name));
  lines.push(`timezone_label=${snapshot.timezone.label}`);
  lines.push(`timezone_source=${formatTruthSourceRef(snapshot.timezone.source)}`);
  lines.push(...buildTruthSignalText('subscription_tier', snapshot.subscription.tier));
  lines.push(...buildTruthSignalText('subscription_access_model', snapshot.subscription.accessModel));
  lines.push(`subscription_source=${formatTruthSourceRef(snapshot.subscription.source)}`);
  lines.push(...buildTruthSignalText('proactive_enabled', snapshot.proactiveEnabled));
  lines.push(...buildTruthSignalText('free_mode_enabled', snapshot.freeModeEnabled));

  lines.push(`location_availability=${snapshot.locationAwareness.availability}`);
  lines.push(...buildTruthSignalText('location_enabled', snapshot.locationAwareness.enabled));
  lines.push(`location_precision=${snapshot.locationAwareness.precision}`);
  lines.push(
    ...buildTruthSignalText(
      'location_fresh_snapshot_available',
      snapshot.locationAwareness.freshSnapshotAvailable,
    ),
  );
  lines.push(
    ...buildTruthSignalText(
      'location_stores_history',
      snapshot.locationAwareness.storesLocationHistory,
    ),
  );
  lines.push(
    ...buildTruthSignalText(
      'location_uses_approximate_context',
      snapshot.locationAwareness.usesApproximateContext,
    ),
  );
  lines.push(`location_source=${formatTruthSourceRef(snapshot.locationAwareness.source)}`);

  lines.push(`voice_name=${snapshot.voice.name}`);
  lines.push(`voice_availability=${snapshot.voice.availability}`);
  lines.push(...buildTruthSignalText('voice_enabled', snapshot.voice.enabled));
  lines.push(...buildTruthSignalText('voice_active_now', snapshot.voice.activeNow));
  lines.push(`voice_source=${formatTruthSourceRef(snapshot.voice.source)}`);
  if (snapshot.voice.note) {
    lines.push(`voice_note=${snapshot.voice.note}`);
  }

  lines.push(`camera_name=${snapshot.camera.name}`);
  lines.push(`camera_availability=${snapshot.camera.availability}`);
  lines.push(...buildTruthSignalText('camera_enabled', snapshot.camera.enabled));
  lines.push(...buildTruthSignalText('camera_active_now', snapshot.camera.activeNow));
  lines.push(`camera_source=${formatTruthSourceRef(snapshot.camera.source)}`);
  if (snapshot.camera.note) {
    lines.push(`camera_note=${snapshot.camera.note}`);
  }

  return lines.join('\n');
}
