// src/engine/actionExecutor.ts

import type {
  Action,
  MoveCardAction,
  ModifyVariableAction,
  ExecuteQueryAction,
  EmitEventAction,
  EndGameAction,
  TargetReference,
  AutoTarget,
  ManualTarget,
  ExecutionContext,
  QueryReference,
  StaticValue
} from '../types/gameDefinitions.js';

export type QueryResolver = (queryRef: QueryReference, context: ExecutionContext) => any;

export interface ActionExecutionResult {
  success: boolean;
  requiresManualInput?: {
    prompt: string;
    filter?: Record<string, any>;
    pendingAction: Action;
  };
  emittedEvents?: { eventName: string; payload?: any }[];
  error?: string;
}

/**
 * Esegue un'azione singola.
 * Nota: Si assume che `context.gameState` sia un oggetto mutabile (es. un draft di Immer).
 */
export async function executeAction(
  action: Action,
  context: ExecutionContext,
  resolveQuery: QueryResolver
): Promise<ActionExecutionResult> {
  try {
    switch (action.type) {
      case 'MOVE_CARD':
        return await executeMoveCard(action, context, resolveQuery);
      
      case 'MODIFY_VARIABLE':
        return executeModifyVariable(action, context, resolveQuery);
      
      case 'EXECUTE_QUERY':
        return executeQuery(action, context, resolveQuery);
      
      case 'EMIT_EVENT':
        return executeEmitEvent(action);
      
      case 'END_GAME':
        return executeEndGame(action, context);
      
      default:
        return { 
          success: false, 
          error: `Tipo di azione sconosciuto: ${(action as any).type}` 
        };
    }
  } catch (error: any) {
    console.error('[ActionExecutor] Errore durante l\'esecuzione:', error);
    return { success: false, error: error.message };
  }
}

// ----------------------------------------------------------------------------
// Handler specifici per ogni tipo di azione
// ----------------------------------------------------------------------------

async function executeMoveCard(
  action: MoveCardAction,
  context: ExecutionContext,
  resolveQuery: QueryResolver
): Promise<ActionExecutionResult> {
  const source = resolveTarget(action.source, context);
  
  // Se la sorgente richiede input manuale, fermiamo l'esecuzione
  if (isManualInputRequired(source)) {
    const manualSource = action.source as ManualTarget;
    return {
      success: true,
      requiresManualInput: {
        prompt: manualSource.prompt,
        // Spread condizionale per soddisfare exactOptionalPropertyTypes
        ...(manualSource.filter !== undefined ? { filter: manualSource.filter } : {}),
        pendingAction: action
      }
    };
  }

  const destination = resolveTarget(action.destination, context);
  if (isManualInputRequired(destination)) {
    const manualDest = action.destination as ManualTarget;
    return {
      success: true,
      requiresManualInput: {
        prompt: manualDest.prompt,
        // Spread condizionale per soddisfare exactOptionalPropertyTypes
        ...(manualDest.filter !== undefined ? { filter: manualDest.filter } : {}),
        pendingAction: action
      }
    };
  }

  // Logica di spostamento (semplificata per l'esempio)
  const cardToMove = extractCardFromSource(source, context);
  if (!cardToMove) {
    return { success: false, error: 'Impossibile trovare una carta nella sorgente' };
  }

  // Rimuovi dalla sorgente
  removeFromSource(source, cardToMove, context);

  // Aggiungi alla destinazione
  cardToMove.faceUp = action.faceUp ?? true;
  addToDestination(destination, cardToMove, context);

  return { success: true };
}

function executeModifyVariable(
  action: ModifyVariableAction,
  context: ExecutionContext,
  resolveQuery: QueryResolver
): ActionExecutionResult {
  const valueToApply = resolveValue(action.value, context, resolveQuery);
  
  let targetObj: any;
  if (action.scope === 'global') {
    targetObj = context.gameState.variables?.global || {};
  } else {
    const playerRef = action.targetRef ? resolveTarget(action.targetRef, context) : context.gameState.currentPlayer;
    targetObj = playerRef?.variables || {};
  }

  if (!targetObj) {
    return { success: false, error: 'Impossibile risolvere il target della variabile' };
  }

  const currentVal = Number(targetObj[action.varName] || 0);
  const numValue = Number(valueToApply) || 0;

  switch (action.operation) {
    case 'SET':
      targetObj[action.varName] = numValue;
      break;
    case 'ADD':
      targetObj[action.varName] = currentVal + numValue;
      break;
    case 'SUBTRACT':
      targetObj[action.varName] = currentVal - numValue;
      break;
  }

  return { success: true };
}

function executeQuery(
  action: ExecuteQueryAction,
  context: ExecutionContext,
  resolveQuery: QueryResolver
): ActionExecutionResult {
  // Costruiamo l'oggetto QueryReference omettendo 'plugin' se è undefined
  const queryRef: QueryReference = {
    query: action.query,
    args: action.args,
    ...(action.plugin !== undefined ? { plugin: action.plugin } : {})
  };

  const result = resolveQuery(queryRef, context);
  
  // Salviamo il risultato nel contesto di esecuzione
  context.context[action.assignToContext] = result;

  return { success: true };
}

function executeEmitEvent(action: EmitEventAction): ActionExecutionResult {
  return {
    success: true,
    emittedEvents: [{ eventName: action.eventName, payload: action.payload }]
  };
}

function executeEndGame(action: EndGameAction, context: ExecutionContext): ActionExecutionResult {
  context.gameState.isGameOver = true;
  
  if (action.winner) {
    const winner = resolveTarget(action.winner, context);
    if (!isManualInputRequired(winner)) {
      context.gameState.winner = winner;
    }
  }
  
  context.gameState.endGameReason = action.reason;
  return { success: true };
}

// ----------------------------------------------------------------------------
// Funzioni Helper per il Targeting e la Risoluzione
// ----------------------------------------------------------------------------

function resolveTarget(target: TargetReference, context: ExecutionContext): any {
  if (target.type === 'manual') {
    return { __MANUAL_INPUT_REQUIRED__: true, manualTarget: target };
  }

  const ref = (target as AutoTarget).ref;
  
  if (ref.startsWith('event.')) {
    return getNestedValue(context.eventPayload, ref.substring(6));
  }
  if (ref.startsWith('context.')) {
    return getNestedValue(context.context, ref.substring(8));
  }
  if (ref.startsWith('zone.')) {
    return context.gameState.zones?.find((z: any) => z.id === ref.substring(5));
  }
  if (ref.startsWith('player.')) {
    const playerId = ref.substring(7);
    if (playerId === 'current') return context.gameState.currentPlayer;
    return context.gameState.players?.find((p: any) => p.id === playerId);
  }

  return getNestedValue(context.gameState, ref);
}

function resolveValue(
  value: QueryReference | StaticValue,
  context: ExecutionContext,
  resolveQuery: QueryResolver
): any {
  if (typeof value === 'object' && value !== null && 'query' in value) {
    return resolveQuery(value as QueryReference, context);
  }
  return value;
}

function isManualInputRequired(resolved: any): boolean {
  return resolved && resolved.__MANUAL_INPUT_REQUIRED__ === true;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

// ----------------------------------------------------------------------------
// Helper specifici per MOVE_CARD
// ----------------------------------------------------------------------------

function extractCardFromSource(source: any, context: ExecutionContext): any {
  if (source && source.id && source.suit) return source;
  if (source && source.cards && Array.isArray(source.cards)) {
    return source.cards[source.cards.length - 1];
  }
  return null;
}

function removeFromSource(source: any, card: any, context: ExecutionContext): void {
  if (source && source.cards && Array.isArray(source.cards)) {
    const index = source.cards.indexOf(card);
    if (index > -1) {
      source.cards.splice(index, 1);
    }
  }
}

function addToDestination(destination: any, card: any, context: ExecutionContext): void {
  if (destination && destination.cards && Array.isArray(destination.cards)) {
    destination.cards.push(card);
  } else if (destination && Array.isArray(destination)) {
    destination.push(card);
  }
}