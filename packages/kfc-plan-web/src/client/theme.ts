import { resolvedTheme, themePreference } from "./state";
import type { ResolvedTheme, ThemePreference } from "./types";

const THEME_STORAGE_KEY = "kfc-plan.theme.preference.v1";
const DESKTOP_THEME_QUERY_KEY = "theme_pref";
const DESKTOP_THEME_ENV_KEY = "theme_env";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

type ThemeState = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
};

type DesktopThemeBridge = {
  isDesktop: boolean;
  getThemeState: () => Promise<ThemeState>;
  setThemePreference: (preference: ThemePreference) => Promise<ThemeState>;
  onThemeChanged: (callback: (state: ThemeState) => void) => () => void;
};

function normalizeThemePreference(value: unknown): ThemePreference {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "dark" || normalized === "light" || normalized === "system") {
    return normalized;
  }
  return "system";
}

function normalizeResolvedTheme(value: unknown): ResolvedTheme {
  return String(value || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function themeMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(THEME_MEDIA_QUERY);
}

function resolvedSystemTheme(): ResolvedTheme {
  const mediaQuery = themeMediaQuery();
  return mediaQuery?.matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark") {
    return "dark";
  }
  if (preference === "light") {
    return "light";
  }
  return resolvedSystemTheme();
}

function desktopBridge(): DesktopThemeBridge | null {
  const maybeWindow = window as typeof window & { kfcPlanDesktopTheme?: DesktopThemeBridge };
  if (!maybeWindow.kfcPlanDesktopTheme?.isDesktop) {
    return null;
  }
  return maybeWindow.kfcPlanDesktopTheme;
}

function readStoredPreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function persistPreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage failures.
  }
}

function readDesktopQueryPreference(): ThemePreference {
  const params = new URLSearchParams(window.location.search);
  if (params.get(DESKTOP_THEME_ENV_KEY) !== "desktop") {
    return "system";
  }
  return normalizeThemePreference(params.get(DESKTOP_THEME_QUERY_KEY));
}

function applyThemeState(state: ThemeState, selectEl?: HTMLSelectElement | null): void {
  const preference = normalizeThemePreference(state.preference);
  const resolved = normalizeResolvedTheme(state.resolvedTheme);
  themePreference.value = preference;
  resolvedTheme.value = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  if (selectEl && selectEl.value !== preference) {
    selectEl.value = preference;
  }
}

export async function initializeThemePreference(selectEl?: HTMLSelectElement | null): Promise<() => void> {
  const bridge = desktopBridge();
  const mediaQuery = themeMediaQuery();
  let detachDesktop = () => {};

  if (bridge) {
    const state = await bridge.getThemeState();
    applyThemeState(state, selectEl);
    detachDesktop = bridge.onThemeChanged((nextState) => {
      applyThemeState(nextState, selectEl);
    });
  } else {
    const queryPreference = readDesktopQueryPreference();
    const preference = queryPreference !== "system" ? queryPreference : readStoredPreference();
    applyThemeState(
      {
        preference,
        resolvedTheme: resolveTheme(preference)
      },
      selectEl
    );
  }

  const onPreferenceChange = async () => {
    const nextPreference = normalizeThemePreference(selectEl?.value);
    if (bridge) {
      const nextState = await bridge.setThemePreference(nextPreference);
      applyThemeState(nextState, selectEl);
      return;
    }
    persistPreference(nextPreference);
    applyThemeState(
      {
        preference: nextPreference,
        resolvedTheme: resolveTheme(nextPreference)
      },
      selectEl
    );
  };

  const onSystemThemeChange = () => {
    if (themePreference.value !== "system") {
      return;
    }
    applyThemeState(
      {
        preference: "system",
        resolvedTheme: resolvedSystemTheme()
      },
      selectEl
    );
  };

  selectEl?.addEventListener("change", onPreferenceChange);
  mediaQuery?.addEventListener("change", onSystemThemeChange);

  return () => {
    detachDesktop();
    selectEl?.removeEventListener("change", onPreferenceChange);
    mediaQuery?.removeEventListener("change", onSystemThemeChange);
  };
}
