import { Move, RefreshCw, Search, ZoomIn, ZoomOut } from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PlanDetail } from "../types";
import type { DiagramAvailability, PlanDiagramTabModel } from "../../lib/plan-diagram";
import { buildPlanDiagramTabsModel } from "../../lib/plan-diagram";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";

interface TechnicalSolutionDiagramPanelProps {
  detail: PlanDetail;
}

type MermaidRenderState = "idle" | "ready" | "error";
type DiagramTabKey = "technical" | "tasks" | "summary";

let mermaidLoader: Promise<any> | null = null;
let panZoomLoader: Promise<any> | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-kfc-plan-script="${url}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${url}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.kfcPlanScript = url;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed to load script: ${url}`)));
    document.head.appendChild(script);
  });
}

async function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs").then((mod: any) => {
      const mermaid = mod?.default ?? mod;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral"
      });
      return mermaid;
    });
  }
  return await mermaidLoader;
}

async function loadSvgPanZoom() {
  if (!panZoomLoader) {
    panZoomLoader = loadScript("https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js").then(() => {
      const loader = (window as any).svgPanZoom;
      if (!loader) {
        throw new Error("svg-pan-zoom global not found after script load.");
      }
      return loader;
    });
  }
  return await panZoomLoader;
}

export function TechnicalSolutionDiagramPanel(props: TechnicalSolutionDiagramPanelProps) {
  const model = useMemo(
    () =>
      buildPlanDiagramTabsModel({
        summary: props.detail.summary,
        sections: props.detail.sections || {}
      }),
    [props.detail.summary.plan_id, props.detail.summary.updated_at, props.detail.sections]
  );
  const [selectedTab, setSelectedTab] = useState<DiagramTabKey>(model.default_tab);

  const mermaidHostRef = useRef<HTMLDivElement>(null);
  const diagramWrapRef = useRef<HTMLDivElement>(null);
  const panZoomRef = useRef<any>(null);
  const autoFitRafRef = useRef<number | null>(null);
  const autoFitForceRef = useRef(false);
  const userAdjustedViewRef = useRef(false);
  const [renderState, setRenderState] = useState<MermaidRenderState>("idle");
  const [renderError, setRenderError] = useState("");
  const [panZoomReady, setPanZoomReady] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [autoFitPaused, setAutoFitPaused] = useState(false);

  const activeTab = useMemo<PlanDiagramTabModel>(() => {
    return model.tabs.find((item) => item.key === selectedTab) || model.tabs[0];
  }, [model, selectedTab]);

  function cancelScheduledAutoFit() {
    if (autoFitRafRef.current !== null) {
      window.cancelAnimationFrame(autoFitRafRef.current);
      autoFitRafRef.current = null;
    }
    autoFitForceRef.current = false;
  }

  function runAutoFit(force = false) {
    const panZoom = panZoomRef.current;
    if (!panZoom) {
      return;
    }
    if (!force && userAdjustedViewRef.current) {
      return;
    }
    panZoom.resize?.();
    panZoom.resetZoom?.();
    panZoom.fit?.();
    panZoom.center?.();
  }

  function scheduleAutoFit(force = false) {
    if (!panZoomRef.current) {
      return;
    }
    if (!force && userAdjustedViewRef.current) {
      return;
    }
    if (force) {
      autoFitForceRef.current = true;
    }
    if (autoFitRafRef.current !== null) {
      return;
    }
    autoFitRafRef.current = window.requestAnimationFrame(() => {
      autoFitRafRef.current = null;
      const forceFit = autoFitForceRef.current;
      autoFitForceRef.current = false;
      runAutoFit(forceFit);
    });
  }

  function markUserAdjustedView() {
    if (userAdjustedViewRef.current) {
      return;
    }
    userAdjustedViewRef.current = true;
    setAutoFitPaused(true);
  }

  function unlockAutoFit() {
    if (!userAdjustedViewRef.current && !autoFitPaused) {
      return;
    }
    userAdjustedViewRef.current = false;
    setAutoFitPaused(false);
  }

  useEffect(() => {
    setSelectedTab(model.default_tab);
    setRenderAttempt(0);
    unlockAutoFit();
  }, [model.default_tab, props.detail.summary.plan_id, props.detail.summary.updated_at]);

  useEffect(() => {
    if (!model.tabs.some((item) => item.key === selectedTab)) {
      setSelectedTab(model.default_tab);
    }
  }, [model, model.default_tab, selectedTab]);

  useEffect(() => {
    let disposed = false;

    async function renderMermaid() {
      const host = mermaidHostRef.current;
      if (!host) {
        return;
      }
      if (panZoomRef.current?.destroy) {
        panZoomRef.current.destroy();
        panZoomRef.current = null;
      }
      cancelScheduledAutoFit();
      setPanZoomReady(false);
      setRenderState("idle");
      setRenderError("");
      host.removeAttribute("data-processed");
      if (activeTab.kind !== "mermaid" || activeTab.status !== "ready") {
        host.textContent = "";
        return;
      }
      host.textContent = activeTab.mermaid_render;
      try {
        const mermaid = await loadMermaid();
        if (disposed) {
          return;
        }
        await mermaid.run({ nodes: [host], suppressErrors: true });
        if (disposed) {
          return;
        }
        const svg = host.querySelector("svg");
        if (svg) {
          svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
          svg.style.width = "100%";
          svg.style.height = "100%";
          svg.style.maxWidth = "none";
          try {
            const svgPanZoom = await loadSvgPanZoom();
            if (!disposed) {
              panZoomRef.current = svgPanZoom(svg, {
                zoomEnabled: true,
                panEnabled: true,
                controlIconsEnabled: false,
                fit: false,
                center: false,
                minZoom: 0.5,
                maxZoom: 8
              });
              unlockAutoFit();
              setPanZoomReady(true);
              panZoomRef.current.resize?.();
              scheduleAutoFit(true);
            }
          } catch {
            setPanZoomReady(false);
          }
        }
        setRenderState("ready");
      } catch (err) {
        if (disposed) {
          return;
        }
        setRenderState("error");
        setRenderError(err instanceof Error ? err.message : String(err));
      }
    }

    void renderMermaid();
    return () => {
      disposed = true;
      cancelScheduledAutoFit();
      if (panZoomRef.current?.destroy) {
        panZoomRef.current.destroy();
        panZoomRef.current = null;
      }
    };
  }, [
    activeTab.kind,
    activeTab.status,
    activeTab.kind === "mermaid" ? activeTab.mermaid_render : "",
    renderAttempt,
    props.detail.summary.plan_id,
    props.detail.summary.updated_at
  ]);

  useEffect(() => {
    if (!panZoomReady || activeTab.kind !== "mermaid" || activeTab.status !== "ready") {
      return;
    }
    const target = diagramWrapRef.current;
    if (!target) {
      return;
    }

    const onResize = () => scheduleAutoFit(false);
    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => onResize());
      observer.observe(target);
    } else {
      window.addEventListener("resize", onResize);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", onResize);
      }
    };
  }, [
    panZoomReady,
    activeTab.key,
    activeTab.kind,
    activeTab.status,
    props.detail.summary.plan_id,
    props.detail.summary.updated_at
  ]);

  useEffect(() => {
    if (!panZoomReady || activeTab.kind !== "mermaid" || activeTab.status !== "ready") {
      return;
    }

    const svg = mermaidHostRef.current?.querySelector("svg");
    if (!svg) {
      return;
    }
    const onManualInteraction = () => markUserAdjustedView();
    svg.addEventListener("wheel", onManualInteraction, { passive: true });
    svg.addEventListener("pointerdown", onManualInteraction);

    return () => {
      svg.removeEventListener("wheel", onManualInteraction);
      svg.removeEventListener("pointerdown", onManualInteraction);
    };
  }, [
    panZoomReady,
    activeTab.key,
    activeTab.kind,
    activeTab.status,
    activeTab.kind === "mermaid" ? activeTab.mermaid_render : "",
    props.detail.summary.plan_id,
    props.detail.summary.updated_at
  ]);

  useEffect(() => {
    return () => {
      cancelScheduledAutoFit();
    };
  }, []);

  function tabStatusLabel(status: DiagramAvailability): string {
    if (status === "ready") {
      return "Ready";
    }
    if (status === "invalid") {
      return "Invalid";
    }
    return "Missing";
  }

  function onRetry() {
    setRenderAttempt((value) => value + 1);
  }

  function renderUnavailableState(tab: PlanDiagramTabModel) {
    return (
      <div class={`implementation-flow-state implementation-flow-state-${tab.status}`}>
        <strong>{tab.status === "invalid" ? "Invalid content" : "Content unavailable"}</strong>
        <p>{tab.status_message}</p>
        {tab.kind === "mermaid" && tab.mermaid_source ? (
          <details class="implementation-flow-source">
            <summary>View raw source</summary>
            <pre>{tab.mermaid_source}</pre>
          </details>
        ) : null}
      </div>
    );
  }

  function zoomIn() {
    markUserAdjustedView();
    panZoomRef.current?.zoomIn?.();
  }

  function zoomOut() {
    markUserAdjustedView();
    panZoomRef.current?.zoomOut?.();
  }

  function resetView() {
    if (!panZoomRef.current) {
      return;
    }
    unlockAutoFit();
    runAutoFit(true);
  }

  return (
    <Card class="implementation-flow-card">
      <CardHeader>
        <CardTitle>
          <Icon icon={Search} />
          Technical Solution Diagram
        </CardTitle>
        <p class="implementation-flow-note">Visual explanation of the selected solution from Brainstorm/Plan.</p>
      </CardHeader>
      <CardContent>
        <div class="implementation-flow-meta">
          <span class={`implementation-flow-chip implementation-flow-chip-${activeTab.status}`}>
            {tabStatusLabel(activeTab.status)}
          </span>
          <span class="implementation-flow-chip implementation-flow-chip-idle">Source: {activeTab.source_label}</span>
          <span class={`implementation-flow-chip implementation-flow-chip-${activeTab.kind === "mermaid" && renderState === "error" ? "error" : renderState}`}>
            Mermaid:{" "}
            {activeTab.kind !== "mermaid"
              ? "N/A"
              : activeTab.status !== "ready"
                ? "Unavailable"
                : renderState === "ready"
                  ? "Rendered"
                  : renderState === "error"
                    ? "Error"
                    : "Loading"}
          </span>
          <span class={`implementation-flow-chip implementation-flow-chip-${panZoomReady ? "ready" : "idle"}`}>
            Pan/Zoom: {panZoomReady ? "Enabled" : "Unavailable"}
          </span>
          <span class={`implementation-flow-chip implementation-flow-chip-${autoFitPaused ? "missing" : "ready"}`}>
            Auto-fit: {autoFitPaused ? "Paused" : "Active"}
          </span>
        </div>

        <div class="implementation-flow-tabs" role="tablist" aria-label="Diagram tabs">
          {model.tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === activeTab.key}
              class={`implementation-flow-tab${tab.key === activeTab.key ? " implementation-flow-tab-active" : ""}`}
              onClick={() => setSelectedTab(tab.key)}
            >
              <span>{tab.label}</span>
              <span class={`implementation-flow-tab-badge implementation-flow-tab-badge-${tab.status}`}>{tabStatusLabel(tab.status)}</span>
            </button>
          ))}
        </div>

        <div class="implementation-flow-toolbar">
          <button
            type="button"
            class="implementation-flow-button"
            onClick={zoomIn}
            disabled={!panZoomReady || activeTab.kind !== "mermaid" || activeTab.status !== "ready"}
            title="Zoom in"
          >
            <Icon icon={ZoomIn} />
          </button>
          <button
            type="button"
            class="implementation-flow-button"
            onClick={zoomOut}
            disabled={!panZoomReady || activeTab.kind !== "mermaid" || activeTab.status !== "ready"}
            title="Zoom out"
          >
            <Icon icon={ZoomOut} />
          </button>
          <button
            type="button"
            class="implementation-flow-button"
            onClick={resetView}
            disabled={!panZoomReady || activeTab.kind !== "mermaid" || activeTab.status !== "ready"}
            title="Reset view"
          >
            <Icon icon={Move} />
          </button>
          <button
            type="button"
            class="implementation-flow-button"
            onClick={onRetry}
            disabled={activeTab.kind !== "mermaid" || activeTab.status !== "ready"}
            title="Retry render"
          >
            <Icon icon={RefreshCw} />
          </button>
        </div>

        {activeTab.kind === "summary" ? (
          activeTab.status === "ready" ? (
            <div class="implementation-flow-summary">
              <ul>
                {activeTab.summary_lines.map((line) => (
                  <li>{line}</li>
                ))}
              </ul>
            </div>
          ) : (
            renderUnavailableState(activeTab)
          )
        ) : activeTab.status === "ready" ? (
          <div class="implementation-flow-diagram-wrap" ref={diagramWrapRef}>
            <div class="implementation-flow-mermaid mermaid" ref={mermaidHostRef} />
          </div>
        ) : (
          renderUnavailableState(activeTab)
        )}

        {activeTab.kind === "mermaid" && renderState === "error" && activeTab.status === "ready" ? (
          <div class="implementation-flow-warning">
            Mermaid render failed: {renderError || "unknown error"}.
            <button type="button" class="implementation-flow-inline-button" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : null}

        {activeTab.warnings.length ? (
          <ul class="implementation-flow-warning-list">
            {activeTab.warnings.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        ) : null}

        {activeTab.kind === "mermaid" && activeTab.mermaid_source ? (
          <details class="implementation-flow-source">
            <summary>View Mermaid source</summary>
            <pre>{activeTab.mermaid_source}</pre>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Backward-compatible export name.
export const ImplementationFlowPanel = TechnicalSolutionDiagramPanel;
export const PlanFlowDiagram = TechnicalSolutionDiagramPanel;
