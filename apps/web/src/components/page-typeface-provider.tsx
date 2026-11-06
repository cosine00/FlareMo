import * as React from "react";
import {
  applyPageTypeface,
  type PageTypefaceId,
  readPageTypeface,
  rememberPageTypeface,
} from "@/lib/page-typeface";

type PageTypefaceState = {
  typeface: PageTypefaceId;
  setTypeface: (id: PageTypefaceId) => void;
};

const PageTypefaceContext = React.createContext<PageTypefaceState | undefined>(
  undefined,
);

export function usePageTypeface(): PageTypefaceState {
  const context = React.useContext(PageTypefaceContext);
  if (context === undefined) {
    throw new Error(
      "usePageTypeface must be used within a PageTypefaceProvider",
    );
  }
  return context;
}

/**
 * Owns the reader's page face. The initial state is read lazily from storage
 * (main.tsx applies it to <html> before the first paint); this provider just
 * keeps the choice and the document in step from then on.
 */
export function PageTypefaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [typeface, setTypefaceState] = React.useState<PageTypefaceId>(() =>
    readPageTypeface(),
  );

  React.useEffect(() => {
    applyPageTypeface(typeface);
  }, [typeface]);

  const setTypeface = React.useCallback((id: PageTypefaceId) => {
    setTypefaceState(id);
    rememberPageTypeface(id);
  }, []);

  const value = React.useMemo(
    () => ({ setTypeface, typeface }),
    [setTypeface, typeface],
  );

  return (
    <PageTypefaceContext.Provider value={value}>
      {children}
    </PageTypefaceContext.Provider>
  );
}
