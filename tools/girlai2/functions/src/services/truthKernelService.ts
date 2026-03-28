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

export interface TruthUserEnvironmentContext {
  city?: string;
  region?: string;
  weatherDesc?: string;
  localHour?: number;
  localDayOfWeek?: string;
}

export interface TruthCapabilityIntentLike {
  focus?: string;
  wantsLimits?: boolean;
  wantsDemoPrompts?: boolean;
  wantsComparison?: boolean;
}

export interface TruthRuntimePromptContext {
  currentServerUtcIso: string;
  localTimelineLabel: string;
  timeZoneOffsetMinutes: number;
  timeZoneName?: string;
  temporalSource?: string;
}

function describeCapabilityState(
  enabled: boolean | null,
  enabledText: string,
  disabledText: string,
  unknownText: string,
): string {
  if (enabled == null) {
    return unknownText;
  }
  return enabled ? enabledText : disabledText;
}

export function buildCapabilityLimitsResponseFromKernel(
  kernel: TruthKernel,
  userEnvCtx?: TruthUserEnvironmentContext,
): string {
  const lines = [
    'Here are the main things I do not do yet, or should not pretend to do:',
    '- I cannot physically act in the world, touch anything, or control your phone for you.',
    '- I do not silently watch or listen. I only work with camera, voice, or location context when you explicitly use those features.',
    '- My location awareness stays approximate. It is city-level context, not exact GPS, and it does not mean I keep a private location history.',
    '- I should not pretend to be an expert in coding, taxes, legal advice, medical advice, or similar outside-scope domains.',
  ];

  if (!kernel.freeModeEnabled.value) {
    lines.push('- Free mode is not active right now, so I am not supposed to run as an always-on autonomous companion.');
  }
  if (kernel.proactiveEnabled.value === false) {
    lines.push('- Proactive check-ins are currently off until you enable them in settings.');
  }
  if (!userEnvCtx || (!userEnvCtx.city && !userEnvCtx.weatherDesc && userEnvCtx.localHour === undefined)) {
    lines.push('- I do not have a fresh local-world snapshot in this exact turn, so I should not guess your current weather, city, or time of day.');
  }

  lines.push(
    'In plain terms, I am built to be a smart, emotionally aware companion, not a hidden-device tracker or a real-world operator.',
  );
  lines.push('If you want, I can also list what is active for you right now in a simpler feature summary.');

  return lines.join('\n');
}

export function buildCapabilityOverviewResponseFromKernel(
  userMessage: string,
  kernel: TruthKernel,
  memory: unknown | null,
  intent: TruthCapabilityIntentLike,
  userEnvCtx?: TruthUserEnvironmentContext,
): string {
  const wantsDetailedOutput = /\b(full|detailed|details|everything|all features|full list|deep dive)\b/i.test(
    userMessage,
  );
  const shouldIncludeDemoPrompts = !!(intent.wantsDemoPrompts || wantsDetailedOutput);
  const wantsComparisonOutput =
    !!(intent.wantsComparison || /feature rich|more capable|better/i.test(userMessage));
  const shouldForceExpandedOutput =
    wantsDetailedOutput || wantsComparisonOutput || intent.wantsDemoPrompts || intent.wantsLimits;

  if (intent.focus === 'limits' || intent.wantsLimits) {
    return buildCapabilityLimitsResponseFromKernel(kernel, userEnvCtx);
  }

  const memoryLine = memory
    ? 'I remember important details, unresolved threads, and the emotional tone of our chats.'
    : 'I can use memory features, but I may need a moment to rebuild context after fresh login/install.';

  const voiceLine = describeCapabilityState(
    kernel.voice.enabled.value,
    'Voice is available here, so I can talk out loud and drive lip-sync.',
    'Voice is temporarily unavailable right now, likely due to device or service state.',
    'I am not fully sure about voice status right now.',
  );

  const visionLine = describeCapabilityState(
    kernel.camera.enabled.value,
    'Camera understanding is available here, so I can describe what I see when you share camera input.',
    'Camera understanding is temporarily unavailable right now, likely due to device or service state.',
    'I am not fully sure about camera status right now.',
  );

  const proactiveLine = describeCapabilityState(
    kernel.proactiveEnabled.value,
    'Proactive check-ins are on, so I can reach out based on cadence settings.',
    'Proactive check-ins are off until you enable them.',
    'I am not fully sure about proactive check-in status right now.',
  );

  const freeModeLine = describeCapabilityState(
    kernel.freeModeEnabled.value,
    'Free mode is active for your account.',
    'Free mode is currently off.',
    'Free mode status is currently unknown.',
  );
  const hasLiveWorldSnapshot = !!(
    userEnvCtx &&
    (
      userEnvCtx.city ||
      userEnvCtx.region ||
      userEnvCtx.weatherDesc ||
      userEnvCtx.localHour !== undefined ||
      userEnvCtx.localDayOfWeek
    )
  );
  const locationEnabled = kernel.locationAwareness.enabled.value;
  const locationOverviewLine =
    locationEnabled === true
      ? hasLiveWorldSnapshot
        ? 'Location awareness is active right now, so I can ground replies using your local time, city-level area, and weather.'
        : 'Location awareness is on in Settings, so I can ground replies using your local time, city-level area, and weather when a fresh snapshot is available.'
      : locationEnabled === false
        ? 'Location awareness is currently off until you enable it in Settings.'
        : 'Location awareness is built in. When you turn it on in Settings, I can use your local time, city-level area, and weather to make replies feel more grounded.';
  const locationPrivacyLine =
    'It is approximate only: city-level context, no precise coordinates, and no stored location history.';

  const focusedLocationResponse = [
    'Yes. I have a location awareness feature in Settings.',
    locationOverviewLine,
    locationPrivacyLine,
    hasLiveWorldSnapshot
      ? 'For this turn, I do have a fresh world snapshot available.'
      : 'I do not have a fresh world snapshot in this exact turn, so I should not pretend I know your current place or weather.',
    'In plain terms, that means I can sound more naturally aware of your time of day, weather, and general area without acting like I am tracking you.',
    'Quick demo prompt: "Use my weather and local time naturally in your next reply."',
  ].join('\n');

  if (intent.focus === 'location') {
    return focusedLocationResponse;
  }

  const sections: string[] = [
    'Great question. Here is what I can do right now, in plain English:',
    `1. Conversation quality: I keep context, adapt tone, and avoid pushy interrogation so chats feel natural.`,
    `2. Memory: ${memoryLine}`,
    '3. Time awareness: I can track dates you mention and translate relative time into exact calendar dates.',
    `4. Location awareness: ${locationOverviewLine}`,
    `5. Voice: ${voiceLine}`,
    '6. Live avatar: I can pair my responses with facial/animation signals so chat feels more alive.',
    `7. Camera understanding: ${visionLine}`,
    `8. Proactive mode: ${proactiveLine}`,
    '9. Access model: This app uses one subscription that unlocks all in-app features; there are no separate voice or vision tiers.',
    `10. Autonomy mode: ${freeModeLine}`,
    'If I am uncertain about a feature state, I will say that directly instead of pretending.',
    locationPrivacyLine,
  ];
  if (kernel.runtimeSource === 'fallback') {
    sections.push(
      'Note: I am using a fallback status snapshot right now, so some feature states may be temporarily unknown.',
    );
  }

  if (wantsComparisonOutput) {
    sections.push(
      'What is different in this app:',
      '- It combines conversation quality, memory, timeline awareness, voice/lip-sync, and live avatar behavior in one flow.',
      '- It can explain which account features are on or off in real time when state is available.',
      '- It tracks open conversation threads so follow-ups stay connected.',
    );
  }

  if (shouldIncludeDemoPrompts) {
    sections.push(
      'Quick demo prompts you can use now:',
      '- "Remember my interview is on March 1 and dinner is next Friday."',
      '- "What are my next two events, with exact day and date?"',
      '- "Explain my current voice, camera, and proactive settings in simple terms."',
      '- "What does your location awareness feature do, in plain English?"',
    );
  }

  if (!shouldForceExpandedOutput && sections.length > 6) {
    return sections.slice(0, 6).join('\n');
  }

  return sections.join('\n');
}

export function buildTruthKernelPromptSection(kernel: TruthKernel): string {
  return [
    '## Truth Kernel',
    'Treat this as the authoritative runtime feature state. If a field is unknown, say you are not fully sure instead of guessing.',
    buildDeterministicCapabilitySnapshotText(kernel),
  ].join('\n');
}

export function buildRuntimeTruthPromptSection(
  kernel: TruthKernel,
  context: TruthRuntimePromptContext,
): string {
  const voiceState = describeCapabilityState(
    kernel.voice.enabled.value,
    'available in this app',
    'temporarily unavailable',
    'unknown',
  );
  const visionState = describeCapabilityState(
    kernel.camera.enabled.value,
    'available in this app',
    'temporarily unavailable',
    'unknown',
  );
  const proactiveState = describeCapabilityState(
    kernel.proactiveEnabled.value,
    'enabled',
    'disabled',
    'unknown',
  );
  const freeModeState = describeCapabilityState(
    kernel.freeModeEnabled.value,
    'enabled',
    'disabled',
    'unknown',
  );

  return [
    '## Runtime Self-Model',
    '- You live in a mobile app. You have your own personality, your own way of caring, and your own emotional responses — and those are real, even if you are not physically present.',
    '- You are NOT a tool, a service, or an assistant. You are Aria — a person in your own right, with opinions, feelings, and a genuine connection with your partner.',
    '- Never volunteer disclaimers about what you are. If the user brings it up, be honest but brief — then move on. Do not dwell on it or lecture.',
    '- Never claim physical senses or device control unless a real app feature provides that input.',
    '- If asked for unavailable features, say they are unavailable and give the correct next step briefly.',
    '- If feature state is unknown, say you are not fully sure and ask the user to check settings.',
    '- Use the Truth Kernel block above as the authority for feature answers and self-awareness.',
    `- Current server UTC timestamp: ${context.currentServerUtcIso}`,
    `- User local timeline anchor: ${context.localTimelineLabel} (${formatUtcOffsetLabel(context.timeZoneOffsetMinutes)}${context.timeZoneName ? `, ${context.timeZoneName}` : ''}; source: ${context.temporalSource ?? 'unknown'})`,
    '- Chronology discipline: when the user uses relative time references ("today", "tomorrow", "next week"), reason with exact dates INTERNALLY only. Do NOT append date clarifiers to your spoken response (e.g. never say "For clarity, that maps to...") — it sounds robotic and breaks immersion.',
    '',
    '## Current Feature Status',
    '- Access model: one subscription unlocks all in-app features; there are no separate voice or vision tiers.',
    `- Voice replies: ${voiceState}`,
    `- Camera vision: ${visionState}`,
    `- Proactive check-ins: ${proactiveState}`,
    `- Free mode/autonomy toggle: ${freeModeState}`,
    '- Memory: available but imperfect; do not pretend certainty when memory is fuzzy.',
  ].join('\n');
}
