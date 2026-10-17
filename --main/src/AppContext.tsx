import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { State, Context, Page, ReportSnapshot, Answer } from "./models";
import { localAdapter } from "./store";
import {
  api,
  type LiveSnapshot,
  stateChanges,
  reconcile,
  APIError,
} from "./live/api";
import { month, stamp } from "./utils";
import { isChair, accessibleHouses, house } from "./store/selectors";
export type Dialog = {
  kind: string;
  id?: string;
  text?: string;
  title?: string;
  report?: ReportSnapshot;
  version?: number;
};
export type Turn = { q: string; a: Answer };
function useValue(initial: State, liveSnapshot?: LiveSnapshot) {
  const live = !!liveSnapshot;
  const stateRef = useRef(initial);
  const revisionRef = useRef(liveSnapshot?.revision || 0);
  const loadedHouseRef = useRef(initial.houses[0]?.id);
  const [syncState, setSyncState] = useState("Сохранено");
  const [data, setData] = useState(initial);
  const leaveGuard = useRef<() => boolean>(() => true);
  const setLeaveGuard = (guard: () => boolean) => {
    leaveGuard.current = guard;
  };
  const [userId, setUserId] = useState(liveSnapshot?.userId || "");
  const [houseId, setHouseId] = useState(initial.houses[0]?.id || "h1");
  const [selectedMonth, setMonth] = useState(month());
  const [page, setPage] = useState<Page>("home");
  const [selected, setSelected] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState("");
  const [chats, setChats] = useState<Record<string, Turn[]>>({});
  const c: Context = { userId, houseId, month: selectedMonth };
  const chair = isChair(data, c);
  const homes = accessibleHouses(data, userId);
  const currentHouse = house(data, c)!;
  const user = data.users.find((u) => u.id === userId);
  useEffect(() => {
    if (live) return;
    return localAdapter.subscribe(() => {
      try {
        const value = localAdapter.load();
        stateRef.current = value;
        setData(value);
      } catch (e) {
        setNotice((e as Error).message);
      }
    });
  }, []);
  const houseRef = useRef(houseId);
  houseRef.current = houseId;
  async function refreshServer() {
    if (!live) return;
    const id = houseRef.current;
    const snapshot = await api<LiveSnapshot>("/state?houseId=" + id);
    if (snapshot.userId !== liveSnapshot?.userId) {
      window.dispatchEvent(new Event("uykomek-session-expired"));
      return;
    }
    if (houseRef.current !== id) return;
    if (
      loadedHouseRef.current === id &&
      snapshot.revision < revisionRef.current
    )
      return;
    loadedHouseRef.current = id;
    revisionRef.current = snapshot.revision;
    stateRef.current = snapshot.state;
    setData(snapshot.state);
  }
  useEffect(() => {
    if (!live) return;
    let disposed = false;
    const refresh = () =>
      refreshServer().catch((e) => {
        if (!disposed) setSyncState((e as Error).message);
      });
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 4000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [houseId]);
  useEffect(() => {
    if (userId && homes.length && !homes.some((h) => h.id === houseId)) {
      setHouseId(homes[0].id);
      setSelected("");
      setDialog(null);
    }
  }, [data, userId, houseId]);
  function go(p: Page, id = "") {
    if (!leaveGuard.current()) return;
    setPage(p);
    setSelected(id);
    setDialog(null);
    window.scrollTo(0, 0);
  }
  function profile(id: string) {
    if (live) return;
    if (!leaveGuard.current()) return;
    const hs = accessibleHouses(data, id);
    if (!hs.length) {
      setNotice("У профиля нет доступного дома.");
      return;
    }
    setUserId(id);
    setHouseId(hs[0].id);
    setPage("home");
    setSelected("");
    setDialog(null);
  }
  function selectHouse(id: string) {
    if (!leaveGuard.current()) return;
    if (!homes.some((h) => h.id === id)) return;
    setHouseId(id);
    setSelected("");
    setDialog(null);
    setPage("home");
  }
  const mutationError = useRef("");
  async function mutate(fn: (s: State) => void, event: string, quiet = false) {
    mutationError.current = "";
    try {
      if (live && loadedHouseRef.current !== c.houseId)
        throw new Error("Дождитесь загрузки выбранного дома.");
      const before = live ? stateRef.current : localAdapter.load();
      const baseRevision = revisionRef.current;
      const s = structuredClone(before);
      fn(s);
      s.events.unshift({
        date: stamp(),
        text: event,
        houseId: c.houseId,
        userId: c.userId,
      });
      if (live) {
        const changes = stateChanges(before, s);
        if (!changes.length) return true;
        setSyncState("Сохраняем на сервере…");
        const result = await api<LiveSnapshot>(
          "/houses/" + c.houseId + "/changes",
          {
            method: "POST",
            body: JSON.stringify({
              revision: baseRevision,
              month: c.month,
              changes,
              confirmedPublication: changes.some(
                (x) =>
                  x.collection === "announcements" ||
                  (x.collection === "docs" &&
                    (x.value as any).status === "Опубликован"),
              ),
            }),
          },
        );
        reconcile(s, result.state);
        stateRef.current = result.state;
        revisionRef.current = result.revision;
        setData(result.state);
        setSyncState("Сохранено");
      } else localAdapter.save(s);
      if (!quiet) setNotice(event);
      return true;
    } catch (e) {
      mutationError.current = (e as Error).message;
      setSyncState(
        e instanceof APIError && e.status === 409
          ? "Конфликт версий: обновите данные; ваш ввод остается в редакторе."
          : "Не удалось сохранить",
      );
      setNotice((e as Error).message);
      return false;
    }
  }
  return {
    data,
    live,
    syncState,
    refreshServer,
    setLeaveGuard,
    c,
    chair,
    homes,
    currentHouse,
    user,
    page,
    selected,
    setSelected,
    go,
    profile,
    selectHouse,
    setMonth,
    dialog,
    open: setDialog,
    notice,
    notify: setNotice,
    mutate,
    mutationError,
    chats,
    setChats,
    setData,
  };
}
type AppValue = ReturnType<typeof useValue>;
const AppContext = createContext<AppValue | null>(null);
export function AppProvider({
  initial,
  children,
  live,
}: {
  live?: LiveSnapshot;
  initial: State;
  children: ReactNode;
}) {
  const value = useValue(initial, live);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("Нет контекста приложения");
  return value;
}
