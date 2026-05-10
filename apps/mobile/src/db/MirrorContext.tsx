import React, { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../convexApi";
import {
  DUAL_WRITE_ENABLED,
  type MirrorStatus,
  type ParityResult,
  useDualWriteMirror,
} from "./mirrorService";

type MirrorContextValue = {
  status: MirrorStatus;
  runParityCheck: () => Promise<ParityResult[]>;
};

const defaultValue: MirrorContextValue = {
  status: { enabled: false, ready: false, lastError: null, lastMirroredAt: null },
  runParityCheck: async () => {
    throw new Error("EXPO_PUBLIC_DUAL_WRITE must be 'true' to run a parity check");
  },
};

const MirrorContext = createContext<MirrorContextValue>(defaultValue);

export function MirrorProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<MirrorContextValue>(defaultValue);

  return (
    <MirrorContext.Provider value={value}>
      {DUAL_WRITE_ENABLED ? <MirrorBridge onValueChange={setValue} /> : null}
      {children}
    </MirrorContext.Provider>
  );
}

export function useMirror() {
  return useContext(MirrorContext);
}

function MirrorBridge({
  onValueChange,
}: {
  onValueChange: (next: MirrorContextValue) => void;
}) {
  const user = useQuery(api.users.current);
  const accounts = useQuery(api.accounts.listForCurrent);
  const transactions = useQuery(api.transactions.listForCurrent);
  const categories = useQuery(api.categories.listForCurrent);
  const liabilities = useQuery(api.liabilities.listForCurrent);
  const importBatches = useQuery(api.importBatches.listForCurrent);
  const recurringSubscriptions = useQuery(api.recurringSubscriptions.listForCurrent);
  const incomeStreams = useQuery(api.incomeStreams.listForCurrent);
  const expenseProfiles = useQuery(api.expenseProfiles.listForCurrent);

  const { status, runParityCheck } = useDualWriteMirror({
    user,
    accounts,
    transactions,
    categories,
    liabilities,
    importBatches,
    recurringSubscriptions,
    incomeStreams,
    expenseProfiles,
  });

  useEffect(() => {
    onValueChange({ status, runParityCheck });
  }, [status, runParityCheck, onValueChange]);

  return null;
}
