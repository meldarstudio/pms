import { ApiError, NetworkError } from "./api-error";
import { targetProblem, type ReservationStay } from "./assignment-availability";
import { configurePropertyCalendar } from "./property-calendar";

export type Room = {
  id: string;
  number: string;
  roomTypeId: string;
};

export type RoomType = {
  id: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  baseRateCents: number;
};

export type PropertySetupInput = {
  roomTypeId?: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  baseRateCents: number;
  rooms: { id?: string; number: string }[];
};

export type PropertySetupResult = { roomType: RoomType; rooms: Room[] };

export function savePropertySetup(input: PropertySetupInput) {
  return writeJson<PropertySetupResult>("/setup", "POST", input);
}

export type InventoryNight = {
  date: string;
  free: number;
  booked: number;
  closed: number;
  priceCents: number;
  override: boolean;
};

export type InventoryRoomType = {
  id: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  baseRateCents: number;
  capacity: number;
  nights: InventoryNight[];
};

export type Inventory = {
  from: string;
  to: string;
  currency: string;
  roomTypes: InventoryRoomType[];
};

export type ReservationLine = {
  id: string;
  roomTypeId: string;
  roomId: string | null;
};

export type Reservation = {
  status: string;
  code?: string;
  balanceCents?: number;
  totalCents?: number;
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  rooms: ReservationLine[];
};

export type RoomClosure = {
  id: string;
  roomId: string;
  starts: string;
  ends: string;
  reason: string | null;
};

export type CalendarAssignedStay = {
  id: string;
  reservationId: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
};

export type HousekeepingStatus = "dirty" | "clean";

export type HousekeepingRoom = {
  id: string;
  number: string;
  roomTypeId: string;
  roomTypeName: string;
  housekeepingStatus: HousekeepingStatus;
  housekeepingChangedAt: string | null;
  closed: boolean;
  inHouse: boolean;
  departing: boolean;
  arriving: boolean;
};

export type HousekeepingMark = Pick<
  HousekeepingRoom,
  "housekeepingStatus" | "housekeepingChangedAt"
>;

export type HousekeepingMarkInput = { roomId: string; status: HousekeepingStatus };

export type MarkedRoom = { id: string } & HousekeepingMark;

export type HousekeepingList = {
  date: string;
  rooms: HousekeepingRoom[];
};

export type CalendarRoom = {
  id: string;
  number: string;
  roomTypeId: string;
  roomTypeName: string;
  housekeepingStatus: HousekeepingStatus;
  stays: CalendarAssignedStay[];
  closures: RoomClosure[];
};

export type CalendarUnassigned = CalendarAssignedStay & {
  roomId: null;
  roomTypeId: string;
  roomIndex: number;
  roomCount: number;
};

export type CalendarWindow = {
  from: string;
  to: string;
  missingSetup: "types" | "rooms" | null;
  rooms: CalendarRoom[];
  unassigned: CalendarUnassigned[];
};

export type Availability = {
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  roomTypes: {
    id: string;
    name: string;
    maxAdults: number;
    maxChildren: number;
    free: number;
    totalCents: number;
    nights: { date: string; priceCents: number }[];
  }[];
};

export type ReservationGuest = {
  id: string;
  fullName: string;

  email: string | null;
  phone: string | null;
  notes: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
};

export type BookingContact = {
  fullName: string;

  email: string | null;
  phone: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
};
export type StayingGuest = BookingContact & {
  id: string;
  reservationRoomId: string | null;
};

export type PaymentMethod = "cash" | "card" | "transfer" | "yape" | "plin" | "other";

export type PaymentInput = {
  amountCents: number;
  method: PaymentMethod;
  paymentDate: string;
  reference?: string;
  notes?: string;
};

export type ReservationPayment = {
  id: string;
  reservationId: string;
  amountCents: number;
  method: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  culqiChargeId: string | null;
};

export type RatePlanCode = "flexible" | "non_refundable";

export type RatePlanTerms = {
  plan: RatePlanCode;
  cancellationPolicy: {
    chargeBasis: "first_night" | "final_total";
    freeUntilDaysBeforeCheckIn: number | null;
  };
  paymentSchedule: "first_night_deposit" | "full_upfront";
  priceAdjustmentPercent: number;
};

export function listRatePlans(signal?: AbortSignal) {
  return getJson<RatePlanTerms[]>("/rate-plans", signal);
}

export type CancellationWaiver = {
  id: string;
  amountCents: number;
  reason: string;
  recordedAt: string;
  recordedBy: string | null;
};

export type ReservationCancellation = {
  id: string;
  outcome: "cancelled" | "no_show";
  recordedAt: string;
  recordedBy: string | null;
  freeUntil: string | null;
  policyChargeCents: number;
  waivedCents: number;
  finalChargeCents: number;
  restoredAt: string | null;
  waivers: CancellationWaiver[];
};

export type ReservationRefund = {
  id: string;
  paymentId: string;
  amountCents: number;
  method: PaymentMethod;
  reference: string | null;
  reason: string;
  status: "requested" | "completed" | "failed";
  requestedAt: string;
  requestedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  refundDate: string | null;
  completionReference: string | null;
  failureReason: string | null;
  culqiChargeId: string | null;
  culqiRefundId: string | null;
};

export type ReservationCoupon = {
  id: string;
  code: string;
  valueCents: number;
  balanceCents: number;
  issuedAt: string;
  issuedBy: string | null;
  expiresOn: string;
};

export type CouponMovementKind = "issue" | "redeem" | "return";

export type ReservationCouponMovement = {
  id: string;
  couponId: string;
  code: string;
  kind: CouponMovementKind;
  amountCents: number;
  recordedAt: string;
  recordedOn: string;
  recordedBy: string | null;
};

export type CouponLookup = ReservationCoupon & {
  sourceReservationId: string;
  sourceReservationCode: string;
  movements: (Omit<ReservationCouponMovement, "couponId" | "code"> & {
    reservationId: string;
  })[];
};

export function getCoupon(code: string, signal?: AbortSignal) {
  return getJson<CouponLookup>(`/coupons/${encodeURIComponent(code)}`, signal);
}

export type ReservationDetail = {
  status: string;
  cancellationReason: string | null;
  cancelledAt: string | null;
  notes: string | null;
  creditCents: number;
  refundDueCents: number;
  refundedCents: number;
  pendingRefundCents: number;
  refunds: ReservationRefund[];
  couponIssuedCents: number;
  couponAppliedCents: number;
  initialPaymentDueCents: number;
  coupons: ReservationCoupon[];
  couponMovements: ReservationCouponMovement[];
  cancellation: ReservationCancellation | null;
  cancellations: ReservationCancellation[];
  savedDiscountCents: number;
  id: string;
  code: string;
  guestId: string;
  guest: ReservationGuest;
  stayingGuests: StayingGuest[];
  checkIn: string;
  checkOut: string;
  source: string;
  currency: string;
  totalCents: number;
  subtotalCents: number;
  discountCents: number;
  paidCents: number;
  balanceCents: number;
  ratePlan: RatePlanTerms;
  requiredInitialPaymentCents: number;
  remainingScheduledCents: number;
  payments: ReservationPayment[];
  rooms: {
    id: string;
    roomTypeId: string;
    roomTypeName: string | null;
    roomId: string | null;
    roomNumber: string | null;
    housekeepingStatus: HousekeepingStatus | null;
    adults: number;
    children: number;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    nights: { date: string; priceCents: number }[];
  }[];
};

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

if (!API_BASE) {
  throw new Error("VITE_API_BASE_URL is not set. Set it before building.");
}

async function responseError(response: Response) {
  const fallback = `No se pudo completar la solicitud (${response.status}).`;
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error
      ? new ApiError(
          response.status,
          body.error,
          response.headers.get("X-Error-Field") ?? undefined,
        )
      : new ApiError(response.status, fallback);
  } catch {
    return new ApiError(response.status, fallback);
  }
}

let unauthorizedHandler: (() => void) | undefined;

export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = undefined;
  };
}

async function request(path: string, init: RequestInit) {
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
    if (response.status === 401 && path !== "/login" && path !== "/session") {
      unauthorizedHandler?.();
    }
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new NetworkError({ cause: error });
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { signal });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

export type AccountRole = "staff" | "owner";
export type Session = { username: string; role: AccountRole; propertyTimeZone: string };
export type Account = { id: string; username: string; role: AccountRole };

function calendarSession(session: Session): Session {
  configurePropertyCalendar(session.propertyTimeZone);
  return session;
}

export async function getSession(signal?: AbortSignal): Promise<Session | null> {
  const response = await request("/session", { signal });
  if (response.status === 401) return null;
  if (!response.ok) throw await responseError(response);
  return calendarSession((await response.json()) as Session);
}

export async function login(input: { username: string; password: string }) {
  return calendarSession(await writeJson<Session>("/login", "POST", input));
}

export function logout() {
  return writeJson<{ ok: true }>("/logout", "POST");
}

export function listAccounts(signal?: AbortSignal) {
  return getJson<Account[]>("/accounts", signal);
}

export function setAccountPassword(id: string, password: string) {
  return writeJson<{ ok: true }>(`/accounts/${id}/password`, "PUT", { password });
}

export function changeOwnPassword(input: { currentPassword: string; newPassword: string }) {
  return writeJson<{ ok: true }>("/account/password", "PUT", input);
}

export function listRooms(signal?: AbortSignal) {
  return getJson<Room[]>("/rooms", signal);
}

export function patchRoom(id: string, body: { number?: string; roomTypeId?: string }) {
  return writeJson<Room>(`/rooms/${id}`, "PATCH", body);
}

async function writeJson<T>(path: string, method: string, body?: unknown) {
  const response = await request(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

export function listRoomTypes(signal?: AbortSignal) {
  return getJson<RoomType[]>("/room-types", signal);
}

export function getInventory(from: string, to: string, signal?: AbortSignal) {
  return getJson<Inventory>(`/inventory?from=${from}&to=${to}`, signal);
}

export function putRoomTypeRates(
  id: string,
  body: { from: string; to: string; priceCents: number; weekdays?: number[] },
) {
  return writeJson<{ updated: number }>(`/room-types/${id}/rates`, "PUT", body);
}

export function deleteRoomTypeRates(id: string, from: string, to: string) {
  return writeJson<{ deleted: number }>(`/room-types/${id}/rates?from=${from}&to=${to}`, "DELETE");
}

export type AvailabilityOccupancy = { adults?: number; children?: number };

export function getAvailability(
  checkIn: string,
  checkOut: string,
  signal?: AbortSignal,
  occupancy?: AvailabilityOccupancy,
) {
  const query = new URLSearchParams({ checkIn, checkOut });
  if (occupancy?.adults !== undefined) query.set("adults", String(occupancy.adults));
  if (occupancy?.children !== undefined) query.set("children", String(occupancy.children));
  return getJson<Availability>(`/availability?${query}`, signal);
}

export function getReservation(id: string, signal?: AbortSignal) {
  return getJson<ReservationDetail>(`/reservations/${id}`, signal);
}

export async function assignRoom(target: ReservationStay, roomId: string) {
  const detail = await getReservation(target.reservationId);
  const line = detail.rooms.find((l) => l.id === target.id);
  if (!line || targetProblem(target, [detail]))
    throw new Error("La habitación cambió. Actualiza la reserva.");
  return sendWorkflow(target.reservationId, {
    requestId: crypto.randomUUID(),
    actions: [
      {
        type: "edit-room",
        lineId: line.id,
        room: {
          roomTypeId: line.roomTypeId,
          roomId,
          adults: line.adults,
          children: line.children,
        },
      },
    ],
  });
}

export function listRoomClosures(from: string, to: string, signal?: AbortSignal) {
  return getJson<RoomClosure[]>(`/room-closures?from=${from}&to=${to}`, signal);
}

export async function getCalendar(from: string, to: string, signal?: AbortSignal) {
  const window = await getJson<CalendarWindow>(
    `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    signal,
  );
  if (window.from !== from || window.to !== to)
    throw new ApiError(500, "calendar window is incomplete");
  return window;
}

export function getHousekeeping(signal?: AbortSignal) {
  return getJson<HousekeepingList>("/housekeeping", signal);
}

export function markHousekeeping(marks: HousekeepingMarkInput[]) {
  return writeJson<{ rooms: MarkedRoom[] }>("/housekeeping", "PUT", { marks });
}

export function createRoomClosure(body: {
  roomId: string;
  starts: string;
  ends: string;
  reason?: string;
}) {
  return writeJson<RoomClosure>("/room-closures", "POST", body);
}

export function patchRoomClosure(
  id: string,
  body: { starts: string; ends: string; reason: string | null },
) {
  return writeJson<RoomClosure>(`/room-closures/${id}`, "PATCH", body);
}

export function deleteRoomClosure(id: string) {
  return writeJson<{ id: string }>(`/room-closures/${id}`, "DELETE");
}

export async function listReservations(from: string, to: string, signal?: AbortSignal) {
  const rows: Reservation[] = [];
  const limit = 200;
  let offset = 0;
  for (;;) {
    const page = await getJson<Reservation[]>(
      `/reservations?from=${from}&to=${to}&limit=${limit}&offset=${offset}`,
      signal,
    );
    rows.push(...page);
    if (page.length < limit || offset >= 2000) return rows;
    offset += limit;
  }
}

export type WorkflowRoom = {
  roomTypeId: string;
  roomId: string | null;
  adults: number;
  children: number;
  nightlyRateCents?: number;
};
export type WorkflowAction =
  | { type: "contact"; contact: BookingContact }
  | { type: "set-guests"; guests: StayingGuest[] }
  | { type: "edit-room"; lineId: string; room: WorkflowRoom }
  | { type: "add-room"; room: WorkflowRoom }
  | { type: "dates"; checkIn: string; checkOut: string }
  | { type: "remove-room"; lineId: string }
  | { type: "set-discount"; amountCents: number }
  | { type: "add-payment"; payment: PaymentInput }
  | {
      type: "set-status";
      reason?: string;
      status: "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
    }
  | { type: "edit-payment"; paymentId: string; payment: PaymentInput }
  | { type: "delete-payment"; paymentId: string }
  | { type: "waive-cancellation-charge"; amountCents: number; reason: string }
  | {
      type: "request-refund";
      paymentId: string;
      amountCents: number;
      method: PaymentMethod;
      reference?: string;
      reason: string;
    }
  | { type: "complete-refund"; refundId: string; refundDate: string; reference: string }
  | { type: "fail-refund"; refundId: string; reason: string }
  | { type: "issue-coupon"; amountCents: number; guestAccepted: true }
  | { type: "redeem-coupon"; code: string; amountCents: number }
  | { type: "notes"; notes: string };
export type WorkflowCommand = {
  requestId: string;
  actions: WorkflowAction[];
};
export type WorkflowBilling = Pick<
  ReservationDetail,
  | "status"
  | "checkIn"
  | "checkOut"
  | "subtotalCents"
  | "totalCents"
  | "discountCents"
  | "paidCents"
  | "balanceCents"
  | "creditCents"
  | "refundDueCents"
  | "refundedCents"
  | "pendingRefundCents"
  | "refunds"
  | "couponIssuedCents"
  | "couponAppliedCents"
  | "initialPaymentDueCents"
  | "coupons"
  | "couponMovements"
  | "cancellation"
  | "cancellations"
  | "savedDiscountCents"
  | "ratePlan"
  | "requiredInitialPaymentCents"
  | "remainingScheduledCents"
> & {
  rooms: ReservationDetail["rooms"];
  payments: ReservationDetail["payments"];
};
export type WorkflowIssue = {
  code: string;
  roomIndex: number;
  field: "roomId" | "roomTypeId" | "occupancy";
};
export type WorkflowPreview = {
  billing: WorkflowBilling;
  validation: { issues: WorkflowIssue[] };
};
export function sendWorkflow(id: string, body: WorkflowCommand) {
  return writeJson<ReservationDetail>(`/reservations/${id}/commands`, "POST", body);
}
export function previewWorkflow(id: string, body: WorkflowCommand) {
  return writeJson<WorkflowPreview>(`/reservations/${id}/preview`, "POST", body);
}
export function createWorkflowBooking(body: {
  checkIn: string;
  checkOut: string;
  requestId: string;
  guest: {
    fullName: string;
    email?: string;
    phone?: string;
    documentType?: string;
    documentNumber?: string;
    notes?: string;
  };
  rooms: WorkflowRoom[];
  notes?: string;
  discountCents?: number;
  ratePlan?: RatePlanCode;
}) {
  return writeJson<ReservationDetail>("/reservations", "POST", body);
}
export type CreationPreviewInput = {
  checkIn: string;
  checkOut: string;
  rooms: Pick<WorkflowRoom, "roomTypeId" | "nightlyRateCents">[];
  discountCents?: number;
  ratePlan?: RatePlanCode;
};
export type CreationPreview = {
  billing: Pick<
    ReservationDetail,
    | "subtotalCents"
    | "discountCents"
    | "totalCents"
    | "paidCents"
    | "balanceCents"
    | "requiredInitialPaymentCents"
    | "remainingScheduledCents"
    | "ratePlan"
    | "currency"
  > & {
    rooms: Pick<
      ReservationDetail["rooms"][number],
      "roomTypeId" | "subtotalCents" | "discountCents" | "totalCents" | "nights"
    >[];
  };
};
export function previewWorkflowBooking(body: CreationPreviewInput) {
  return writeJson<CreationPreview>("/reservations/preview", "POST", body);
}
export function searchReservations(
  params: {
    q?: string;
    status?: string;
    checkIn?: string;
    offset?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
  });
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.checkIn) query.set("checkIn", params.checkIn);
  return getJson<(ReservationDetail & { guestName: string })[]>(`/reservations?${query}`, signal);
}

export type ReservationListParams = {
  q?: string;
  checkIn?: string;
  checkOut?: string;
  statuses?: string;
  balance?: "outstanding" | "settled" | "credit";
  refund?: "due" | "requested";
  assignment?: "assigned" | "unassigned";
  sort: "checkIn" | "checkOut" | "guestName" | "balance";
  direction: "asc" | "desc";
  limit: number;
  offset: number;
};
export type ReservationListPage = {
  rows: (ReservationDetail & { guestName: string })[];
  total: number;
  limit: number;
  offset: number;
};

export function searchReservationsPage(params: ReservationListParams, signal?: AbortSignal) {
  const query = new URLSearchParams({ paginated: "true" });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return getJson<ReservationListPage>(`/reservations?${query}`, signal);
}
