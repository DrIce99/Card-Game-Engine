// src/types/gameDefinitions.ts

// ============================================================================
// 1. CONFIGURAZIONE E DEFINIZIONE DEL GIOCO
// ============================================================================

export type GamePhase = "before" | "normal" | "after";

export interface GameDefinition {
  engineVersion: string; // Es: "1.0.0"
  gameVersion: string;   // Es: "1.0.0"
  gameId: string;
  name: string;
  
  config: GameConfig;
  rules: Rule[];
  requiredPlugins: string[]; // Es: ["briscola"]
}

export interface GameConfig {
  deck: DeckConfig;
  players: PlayerConfig;
  zones: ZoneConfig[];
  variables: {
    global: string[];
    player: string[];
  };
}

export interface DeckConfig {
  type: string; // Es: "french_52", "french_40"
  shuffleOnInit: boolean;
}

export interface PlayerConfig {
  min: number;
  max: number;
  mode: "individual" | "teams";
}

export interface ZoneConfig {
  id: string;
  name: string;
  capacity: number;
  visibility: "hidden" | "owner_only" | "public";
}

// ============================================================================
// 2. SISTEMA DI REGOLE (Trigger, Condizioni, Azioni)
// ============================================================================

export interface Rule {
  id: string;
  name: string;
  phase: GamePhase;       // before, normal, after
  priority: number;       // ordinamento all'interno della fase
  trigger: Trigger;
  condition?: ConditionNode; // struttura ad albero
  actions: Action[];
}

export interface Trigger {
  event: string;          // Es: "CARD_MOVED", "VARIABLE_CHANGED"
  filters?: Record<string, any>; // Es: { targetZoneId: "trick" }
}

// Struttura ad albero per condizioni composte (A AND (B OR C))
export type ConditionNode = SimpleCondition | CompositeCondition;

export interface SimpleCondition {
  operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE" | "TRUE" | "FALSE";
  left: QueryReference | StaticValue;
  right: QueryReference | StaticValue;
}

export interface CompositeCondition {
  operator: "AND" | "OR";
  conditions: ConditionNode[];
}

export interface QueryReference {
  query: string;          // Nome della query (Core o Plugin)
  plugin?: string;        // Se specificato, cerca la query nel plugin
  args: any[];            // Argomenti passati alla query
}

export type StaticValue = string | number | boolean | null;

// ============================================================================
// 3. SISTEMA DI AZIONI E TARGETING
// ============================================================================

export type Action = 
  | MoveCardAction
  | ModifyVariableAction
  | ExecuteQueryAction
  | EmitEventAction
  | EndGameAction;

// Distinzione netta tra Target Automatico e Manuale
export type TargetReference = AutoTarget | ManualTarget;

export interface AutoTarget {
  type: "auto";
  ref: string; // Es: "event.sourceCard", "context.trickWinner", "zone.deck"
}

export interface ManualTarget {
  type: "manual";
  prompt: string; // Messaggio per l'UI (es. "Scegli una carta")
  filter?: Record<string, any>; // Es: { zoneId: "hand", owner: "currentPlayer" }
}

export interface MoveCardAction {
  type: "MOVE_CARD";
  source: TargetReference;
  destination: TargetReference;
  faceUp?: boolean;
}

export interface ModifyVariableAction {
  type: "MODIFY_VARIABLE";
  scope: "global" | "player";
  targetRef?: TargetReference; // Se player, indica quale giocatore
  varName: string;
  operation: "SET" | "ADD" | "SUBTRACT";
  value: QueryReference | StaticValue;
}

export interface ExecuteQueryAction {
  type: "EXECUTE_QUERY";
  query: string;
  plugin?: string;
  args: any[];
  assignToContext: string; // Es: "trickWinner"
}

export interface EmitEventAction {
  type: "EMIT_EVENT";
  eventName: string;
  payload?: Record<string, any>;
}

export interface EndGameAction {
  type: "END_GAME";
  winner?: TargetReference;
  reason: string;
}

// ============================================================================
// 4. CONTRATTO DEL PLUGIN SYSTEM
// ============================================================================

// Il motore espone questa interfaccia ai plugin
export interface EngineAPI {
  registerQuery: (name: string, fn: QueryFunction) => void;
  registerAction: (name: string, fn: ActionFunction) => void;
}

export type QueryFunction = (args: any[], context: ExecutionContext) => any;
export type ActionFunction = (args: any[], context: ExecutionContext) => Promise<ActionResult>;

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface GamePlugin {
  id: string;
  name: string;
  register: (engine: EngineAPI) => void;
}

// Il contesto di esecuzione passato a Query e Azioni
export interface ExecutionContext {
  gameState: any; // Lo stato attuale del gioco (sola lettura per le query)
  eventPayload: any; // I dati dell'evento che ha scatenato la regola
  context: Record<string, any>; // Le variabili temporanee di esecuzione
}