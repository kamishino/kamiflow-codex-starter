import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@kamishino/kfc-web-ui";
import type { ChatSessionPayload, SessionDiscoveryItem } from "../types";

interface SessionPanelProps {
  session: ChatSessionPayload | null;
  discoveryItems: SessionDiscoveryItem[];
  discoveryQuery: string;
  canBind: boolean;
  onDiscoverySearch: (value: string) => void;
  onDiscoveryQueryInput: (value: string) => void;
  onDiscoveryBind: (sessionId: string) => void;
  onCopyResume: () => void;
  onCopySessionId: () => void;
  onCopySessionPath: () => void;
  onRevealFile: () => void;
  onRevealFolder: () => void;
}

export function SessionPanel(props: SessionPanelProps) {
  const bound = props.session?.bound_session;
  const items = bound?.bound
    ? [["Plan ID", bound.plan_id], ["Session ID", bound.session_id], ["Session Path", bound.session_path], ["Profile", bound.profile || "<none>"], ["Bound At", bound.bound_at || "<unknown>"], ["Project Plan", bound.plan_path || "<unknown>"]]
    : [["State", bound?.reason || "No Codex session bound."]];
  const liveState = [
    `Status: ${props.session?.status || "idle"}`,
    `Busy: ${props.session?.busy ? "yes" : "no"}`,
    `Queue depth: ${props.session?.queue_depth || 0}`,
    `Connections: ${props.session?.connection_count || 0}`,
    `Last prompt: ${props.session?.last_prompt_at || "<none>"}`,
    `Last result: ${props.session?.last_result?.text || "<none>"}`
  ];
  const discoveryItems = props.discoveryItems || [];
  const hasDiscoveryItems = discoveryItems.length > 0;

  return (
    <aside class="panel panel-session ui-card">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">Bound Session</p>
          <h2 id="bound-session-title">{bound?.bound ? bound.session_id : "No Codex session bound"}</h2>
        </div>
        <Badge id="bound-state-chip" tone={bound?.bound ? "success" : "danger"}>{bound?.bound ? "Bound" : "Blocked"}</Badge>
      </div>
      <dl id="bound-session-grid" class="detail-grid">
        {items.map(([label, value]) => (
          <div key={`${label}-${value}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <Card class="action-card">
        <CardHeader class="section-row">
          <CardTitle>Manual Interactive Resume</CardTitle>
          <Button id="copy-resume-button" type="button" variant="outline" onClick={props.onCopyResume} disabled={!bound?.bound}>Copy Command</Button>
        </CardHeader>
        <CardContent class="stack-gap-sm">
          <p class="hint">Terminal-style interactive resume is outside this browser surface. Use the command below when you want to continue the same session directly in Codex.</p>
          <pre id="manual-resume-command" class="command-block">{bound?.manual_resume_command || bound?.reason || "No Codex session bound."}</pre>
        </CardContent>
      </Card>
      <Card class="action-card">
        <CardHeader>
          <CardTitle>Light Session Actions</CardTitle>
        </CardHeader>
        <CardContent class="stack-gap-sm">
          <div class="quick-actions">
            <Button id="copy-session-id-button" type="button" variant="outline" onClick={props.onCopySessionId} disabled={!bound?.bound}>Copy Session ID</Button>
            <Button id="copy-session-path-button" type="button" variant="outline" onClick={props.onCopySessionPath} disabled={!bound?.bound}>Copy Session Path</Button>
            <Button id="reveal-session-file-button" type="button" variant="outline" onClick={props.onRevealFile} disabled={!bound?.bound}>Reveal File</Button>
            <Button id="reveal-session-folder-button" type="button" variant="outline" onClick={props.onRevealFolder} disabled={!bound?.bound}>Reveal Folder</Button>
          </div>
          <p class="hint">These actions stay project-bound. Session browsing and switching remain in <code>kfc-session</code>.</p>
        </CardContent>
      </Card>
      <Card class="action-card" id="session-discovery-card">
        <CardHeader>
          <CardTitle>Session Discovery</CardTitle>
        </CardHeader>
        <CardContent class="stack-gap-sm">
          <label class="field">
            <span>Search sessions</span>
            <input
              id="session-discovery-query"
              type="text"
              value={props.discoveryQuery}
              onInput={(event: any) => props.onDiscoveryQueryInput(event.currentTarget.value)}
              placeholder="Search by id, filename, path, or preview"
            />
          </label>
          <div class="quick-actions">
            <Button id="session-discovery-search" type="button" onClick={() => props.onDiscoverySearch(props.discoveryQuery)} disabled={!props.canBind}>Load Sessions</Button>
            <Button id="session-discovery-clear" type="button" variant="outline" onClick={() => props.onDiscoverySearch("")}>Clear</Button>
          </div>
          <div id="session-discovery-empty" class="hint" hidden={hasDiscoveryItems}>
            {props.canBind ? "Search and list nearby Codex sessions to bind this project." : "Bind this project first to enable session discovery."}
          </div>
          {hasDiscoveryItems ? (
            <div class="session-discovery-list">
              {discoveryItems.map((item) => (
                <article class="session-discovery-item" key={item.session_id}>
                  <div class="session-discovery-row">
                    <p class="session-discovery-id">{item.session_id}</p>
                    <Button
                      id={`session-discovery-bind-${item.session_id}`}
                      type="button"
                      variant="outline"
                      onClick={() => props.onDiscoveryBind(item.session_id)}
                      disabled={!props.canBind}
                    >
                      Bind
                    </Button>
                  </div>
                  <p class="session-discovery-path">{item.relative_path || item.file_path}</p>
                  <p class="session-discovery-preview">{item.preview_text || item.file_name}</p>
                  <p class="hint">Modified: {item.modified_at}</p>
                </article>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card class="action-card">
        <CardHeader>
          <CardTitle>Live State</CardTitle>
        </CardHeader>
        <CardContent>
          <ul id="live-state-list" class="state-list">
            {liveState.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}
