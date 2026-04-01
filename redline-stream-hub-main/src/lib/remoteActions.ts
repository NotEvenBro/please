export type RemoteAction =
  | "LEFT"
  | "RIGHT"
  | "UP"
  | "DOWN"
  | "SELECT"
  | "BACK"
  | "HOME"
  | "PLAY_PAUSE"
  | "PAUSE"
  | "SEEK_FORWARD"
  | "SEEK_BACK"
  | "VOLUME_UP"
  | "VOLUME_DOWN"
  | null;

export interface RemoteKeyInput {
  key?: string;
  code?: string;
  keyCode?: number;
}

const BACK_KEYS = new Set(["Escape", "BrowserBack", "Backspace", "GoBack", "XF86Back", "HistoryBack", "Back"]);
const BACK_CODES = new Set([8, 27, 166, 461, 10009]);

const SELECT_KEYS = new Set(["Enter", " ", "OK", "Select", "Center"]);
const SELECT_CODES = new Set([13, 23, 66]);

const PLAY_PAUSE_KEYS = new Set(["MediaPlayPause"]);
const PLAY_PAUSE_CODES = new Set([179, 415]);

const PAUSE_KEYS = new Set(["MediaPause"]);
const PAUSE_CODES = new Set([19]);

const SEEK_FORWARD_KEYS = new Set(["MediaTrackNext"]);
const SEEK_FORWARD_CODES = new Set([417, 228]);

const SEEK_BACK_KEYS = new Set(["MediaTrackPrevious"]);
const SEEK_BACK_CODES = new Set([412, 227]);

const VOLUME_UP_CODES = new Set([447, 175]);
const VOLUME_DOWN_CODES = new Set([448, 174]);

function toArrowKeyName(key: string) {
  if (key === "Left") return "ArrowLeft";
  if (key === "Right") return "ArrowRight";
  if (key === "Up") return "ArrowUp";
  if (key === "Down") return "ArrowDown";
  return key;
}

export function mapRemoteAction({ key = "", code, keyCode = 0 }: RemoteKeyInput): RemoteAction {
  const normalizedKey = toArrowKeyName(key);

  if (normalizedKey === "ArrowLeft" || keyCode === 37) return "LEFT";
  if (normalizedKey === "ArrowRight" || keyCode === 39) return "RIGHT";
  if (normalizedKey === "ArrowUp" || keyCode === 38) return "UP";
  if (normalizedKey === "ArrowDown" || keyCode === 40) return "DOWN";

  if (normalizedKey === "Home") return "HOME";

  if (SELECT_KEYS.has(normalizedKey) || code === "NumpadEnter" || SELECT_CODES.has(keyCode)) return "SELECT";

  if (BACK_KEYS.has(normalizedKey) || BACK_CODES.has(keyCode)) return "BACK";

  if (PLAY_PAUSE_KEYS.has(normalizedKey) || PLAY_PAUSE_CODES.has(keyCode)) return "PLAY_PAUSE";
  if (PAUSE_KEYS.has(normalizedKey) || PAUSE_CODES.has(keyCode)) return "PAUSE";

  if (SEEK_FORWARD_KEYS.has(normalizedKey) || SEEK_FORWARD_CODES.has(keyCode)) return "SEEK_FORWARD";
  if (SEEK_BACK_KEYS.has(normalizedKey) || SEEK_BACK_CODES.has(keyCode)) return "SEEK_BACK";

  if (VOLUME_UP_CODES.has(keyCode)) return "VOLUME_UP";
  if (VOLUME_DOWN_CODES.has(keyCode)) return "VOLUME_DOWN";

  return null;
}
