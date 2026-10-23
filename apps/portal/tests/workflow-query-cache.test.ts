import assert from "node:assert/strict";
import { it } from "vite-plus/test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { ReservationDetail } from "../src/lib/api.ts";
import { refreshWorkflowQueries } from "../src/lib/workflow-query-cache.ts";

it("refreshes active and invalidates inactive pricing previews after saving a discount or payment", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const key = ["workflow-edit-preview", "reservation-1", { actions: ["dates"] }];
  const inactiveKey = ["workflow-edit-preview", "reservation-1", { actions: ["status"] }];
  const otherKey = ["workflow-edit-preview", "reservation-2"];
  client.setQueryData(inactiveKey, { balanceCents: 30000 });
  client.setQueryData(otherKey, { balanceCents: 9000 });
  client.setQueryData(["reservation", "reservation-1"], {
    id: "reservation-1",
    discountCents: 0,
    paidCents: 0,
  });
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => {
      const saved = client.getQueryData<ReservationDetail>(["reservation", "reservation-1"])!;
      return { balanceCents: 30000 - saved.discountCents - saved.paidCents };
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await observer.refetch();
    assert.equal(observer.getCurrentResult().data?.balanceCents, 30000);
    await refreshWorkflowQueries(client, {
      id: "reservation-1",
      discountCents: 2000,
      paidCents: 0,
    } as ReservationDetail);
    assert.equal(observer.getCurrentResult().data?.balanceCents, 28000);
    assert.equal(client.getQueryState(inactiveKey)?.isInvalidated, true);
    await refreshWorkflowQueries(client, {
      id: "reservation-1",
      discountCents: 2000,
      paidCents: 10000,
    } as ReservationDetail);
    assert.equal(observer.getCurrentResult().data?.balanceCents, 18000);
    assert.equal(client.getQueryState(otherKey)?.isInvalidated, false);
  } finally {
    unsubscribe();
    client.clear();
  }
});

it("ignores an older in-flight preview when a separately saved payment refreshes the draft", async () => {
  const client = new QueryClient();
  const key = ["workflow-edit-preview", "reservation-1"];
  client.setQueryData(key, { balanceCents: 30000 });
  client.setQueryData(["reservation", "reservation-1"], {
    id: "reservation-1",
    paidCents: 0,
  });
  let finishOld!: () => void;
  let calls = 0;
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => {
      const saved = client.getQueryData<ReservationDetail>(["reservation", "reservation-1"])!;
      const balanceCents = 30000 - saved.paidCents;
      if (++calls === 1)
        await new Promise<void>((resolve) => {
          finishOld = resolve;
        });
      return { balanceCents };
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    const oldRequest = observer.refetch();
    assert.equal(observer.getCurrentResult().isFetching, true);
    await refreshWorkflowQueries(client, {
      id: "reservation-1",
      paidCents: 10000,
    } as ReservationDetail);
    assert.equal(observer.getCurrentResult().data?.balanceCents, 20000);
    finishOld();
    await oldRequest;
    assert.equal(observer.getCurrentResult().data?.balanceCents, 20000);
    assert.equal(observer.getCurrentResult().isFetching, false);
  } finally {
    finishOld?.();
    unsubscribe();
    client.clear();
  }
});
