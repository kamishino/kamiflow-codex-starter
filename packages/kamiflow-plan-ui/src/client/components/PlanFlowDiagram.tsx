import { Move, Search, ZoomIn, ZoomOut } from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PlanDetail } from "../types";
import { buildTechnicalSolutionDiagramModel } from "../../lib/plan-diagram";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";

interface TechnicalSolutionDiagramPanelProps {
  detail: PlanDetail;
}

type MermaidRenderState = "idle" | "ready" | "error";

let mermaidLoader: Promise<any> | null = null;
let panZoomLoader: Promise<any> | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-kfp-script="${url}"]`);
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
    script.dataset.kfpScript = url;
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
      buildTechnicalSolutionDiagramModel({
        summary: props.detail.summary,
        sections: props.detail.sections || {}
      }),
    [props.detail.summary.plan_id, props.detail.summary.updated_at, props.detail.sections]
  );

  const mermaidHostRef = useRef<HTMLDivElement>(null);
  const panZoomRef = useRef<any>(null);
  const [renderState, setRenderState] = useState<MermaidRenderState>("idle");
  const [renderError, setRenderError] = useState("");
  const [panZoomReady, setPanZoomReady] = useState(false);

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
      setPanZoomReady(false);
      setRenderState("idle");
      setRenderError("");
      host.removeAttribute("data-processed");
      host.textContent = model.mermaid_render;
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
          try {
            const svgPanZoom = await loadSvgPanZoom();
            if (!disposed) {
              panZoomRef.current = svgPanZoom(svg, {
                zoomEnabled: true,
                panEnabled: true,
                controlIconsEnabled: false,
                fit: true,
                center: true,
                minZoom: 0.5,
                maxZoom: 8
              });
              setPanZoomReady(true);
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
      if (panZoomRef.current?.destroy) {
        panZoomRef.current.destroy();
        panZoomRef.current = null;
      }
    };
  }, [model.mermaid_render, props.detail.summary.plan_id, props.detail.summary.updated_at]);

  function zoomIn() {
    panZoomRef.current?.zoomIn?.();
  }

  function zoomOut() {
    panZoomRef.current?.zoomOut?.();
  }

  function resetView() {
    if (!panZoomRef.current) {
      return;
    }
    panZoomRef.current.resetZoom?.();
    panZoomRef.current.fit?.();
    panZoomRef.current.center?.();
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
          <span class={`implementation-flow-chip implementation-flow-chip-${model.source_type}`}>
            {model.source_type === "section" ? `From ${model.section_name}` : "Derived placeholder"}
          </span>
          <span class={`implementation-flow-chip implementation-flow-chip-${renderState}`}>
            Mermaid: {renderState === "ready" ? "Rendered" : renderState === "error" ? "Fallback" : "Loading"}
          </span>
          <span class={`implementation-flow-chip implementation-flow-chip-${panZoomReady ? "ready" : "idle"}`}>
            Pan/Zoom: {panZoomReady ? "Enabled" : "Unavailable"}
          </span>
        </div>

        <div class="implementation-flow-toolbar">
          <button type="button" class="implementation-flow-button" onClick={zoomIn} disabled={!panZoomReady} title="Zoom in">
            <Icon icon={ZoomIn} />
          </button>
          <button type="button" class="implementation-flow-button" onClick={zoomOut} disabled={!panZoomReady} title="Zoom out">
            <Icon icon={ZoomOut} />
          </button>
          <button type="button" class="implementation-flow-button" onClick={resetView} disabled={!panZoomReady} title="Reset view">
            <Icon icon={Move} />
          </button>
        </div>

        <div class="implementation-flow-diagram-wrap">
          <div class="implementation-flow-mermaid mermaid" ref={mermaidHostRef} />
        </div>

        {renderState === "error" ? (
          <div class="implementation-flow-warning">
            Mermaid render failed: {renderError || "unknown error"}. Showing source below.
          </div>
        ) : null}

        {model.warnings.length ? (
          <ul class="implementation-flow-warning-list">
            {model.warnings.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        ) : null}

        <details class="implementation-flow-source">
          <summary>View Mermaid source</summary>
          <pre>{model.mermaid_source}</pre>
        </details>
      </CardContent>
    </Card>
  );
}

// Backward-compatible export name.
export const ImplementationFlowPanel = TechnicalSolutionDiagramPanel;
export const PlanFlowDiagram = TechnicalSolutionDiagramPanel;
