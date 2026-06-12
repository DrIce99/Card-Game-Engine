// src/engine/ruleEngine.ts

import { validateGameDefinition, ValidationResult } from '../validator/gameValidator.js';
import { evaluateCondition, QueryResolver } from './conditionEvaluator.js';
import { executeAction, ActionExecutionResult } from './actionExecutor.js';
import type {
  GameDefinition,
  Rule,
  GamePlugin,
  EngineAPI,
  QueryFunction,
  ActionFunction,
  ExecutionContext,
  QueryReference
} from '../types/gameDefinitions.js';

export interface EngineExecutionResult {
  completed: boolean; // True se tutta la cascata di eventi è finita
  requiresManualInput?: {
    prompt: string;
    filter?: Record<string, any>;
    // La UI chiamerà questa funzione con la scelta dell'utente per riprendere
    resume: (userChoice: any) => Promise<EngineExecutionResult>; 
  };
  isGameOver?: boolean;
  winner?: any;
  endGameReason?: string;
}

export class RuleEngine {
  private definition: GameDefinition;
  private queryRegistry: Map<string, QueryFunction> = new Map();
  private actionRegistry: Map<string, ActionFunction> = new Map();
  private state: any; // Sarà un Immer draft durante l'esecuzione
  private maxCascadeDepth = 50; // Sicurezza anti-loop infinito

  constructor(definition: GameDefinition, initialState: any) {
    // 1. Validazione Preventiva (Fail-Fast)
    const validation: ValidationResult = validateGameDefinition(definition);
    if (!validation.isValid) {
      const errorMsg = validation.errors
        .filter(e => e.severity === 'error')
        .map(e => `[${e.ruleId || 'Global'}] ${e.field || 'Root'}: ${e.message}`)
        .join('\n');
      throw new Error(`Definizione di gioco non valida:\n${errorMsg}`);
    }

    this.definition = definition;
    this.state = initialState;

    // 2. Registrazione Query Core di base (esempi)
    this.registerQuery('getZoneCardCount', (args, ctx) => {
      const zoneId = args[0];
      const zone = ctx.gameState.zones?.find((z: any) => z.id === zoneId);
      return zone?.cards?.length || 0;
    });

    this.registerQuery('getPlayerVariable', (args, ctx) => {
      const playerId = args[0];
      const varName = args[1];
      const player = ctx.gameState.players?.find((p: any) => p.id === playerId);
      return player?.variables?.[varName] ?? 0;
    });

    // 3. Caricamento Plugin Richiesti
    // (In un'app reale, questi verrebbero importati dinamicamente o passati al costruttore)
    // this.loadPlugins(); 
  }

  /**
   * Registra un plugin di gioco (es. Briscola, Poker)
   */
  public registerPlugin(plugin: GamePlugin): void {
    if (this.definition.requiredPlugins && !this.definition.requiredPlugins.includes(plugin.id)) {
      console.warn(`Plugin '${plugin.id}' registrato ma non presente in requiredPlugins.`);
    }

    const api: EngineAPI = {
      registerQuery: (name, fn) => {
        const fullName = plugin.id ? `${plugin.id}:${name}` : name;
        this.queryRegistry.set(fullName, fn);
      },
      registerAction: (name, fn) => {
        const fullName = plugin.id ? `${plugin.id}:${name}` : name;
        this.actionRegistry.set(fullName, fn);
      }
    };

    plugin.register(api);
  }

  /**
   * Punto di ingresso principale: emette un evento nel motore.
   */
  public async emit(eventName: string, payload: any = {}): Promise<EngineExecutionResult> {
    let eventQueue: { name: string; payload: any }[] = [{ name: eventName, payload }];
    let depth = 0;

    while (eventQueue.length > 0 && depth < this.maxCascadeDepth) {
      const currentEvent = eventQueue.shift()!;
      depth++;

      // 1. Trova le regole pertinenti
      const matchingRules = this.definition.rules.filter(rule => 
        rule.trigger.event === currentEvent.name && this.matchesFilters(rule.trigger.filters, currentEvent.payload)
      );

      // 2. Ordina le regole (Fase -> Priorità decrescente)
      this.sortRules(matchingRules);

      // 3. Esegui le regole
      for (const rule of matchingRules) {
        const context: ExecutionContext = {
          gameState: this.state,
          eventPayload: currentEvent.payload,
          context: {} // Contesto temporaneo pulito per ogni regola
        };

        // Valuta condizione
        const conditionMet = rule.condition 
          ? evaluateCondition(rule.condition, context, this.resolveQuery.bind(this))
          : true;

        if (!conditionMet) continue;

        // Esegui azioni
        for (const action of rule.actions) {
          const result = await executeAction(action, context, this.resolveQuery.bind(this));

          if (!result.success) {
            console.error(`[RuleEngine] Errore nell'azione della regola ${rule.id}:`, result.error);
            continue;
          }

          // GESTIONE INPUT MANUALE: Pausa immediata e ritorno alla UI
          if (result.requiresManualInput) {
            return {
              completed: false,
              requiresManualInput: {
                prompt: result.requiresManualInput.prompt,
                filter: result.requiresManualInput.filter,
                resume: async (userChoice: any) => {
                  // Inietta la scelta dell'utente nel payload dell'evento corrente
                  const newPayload = { ...currentEvent.payload, userChoice };
                  // Riprende l'emissione dello stesso evento, ma ora l'azione manuale avrà i dati
                  return this.emit(currentEvent.name, newPayload);
                }
              }
            };
          }

          // Accoda nuovi eventi emessi dalle azioni
          if (result.emittedEvents) {
            eventQueue.push(...result.emittedEvents);
          }
        }
      }
    }

    if (depth >= this.maxCascadeDepth) {
      console.warn('[RuleEngine] Raggiunta la profondità massima di cascata. Possibile loop infinito.');
    }

    return {
      completed: true,
      isGameOver: this.state.isGameOver,
      winner: this.state.winner,
      endGameReason: this.state.endGameReason
    };
  }

  // ----------------------------------------------------------------------------
  // Metodi Privati di Supporto
  // ----------------------------------------------------------------------------

  private resolveQuery(queryRef: QueryReference, context: ExecutionContext): any {
    const queryName = queryRef.plugin 
      ? `${queryRef.plugin}:${queryRef.query}` 
      : queryRef.query;

    const resolver = this.queryRegistry.get(queryName);
    if (!resolver) {
      throw new Error(`Query non registrata: ${queryName}`);
    }

    return resolver(queryRef.args, context);
  }

  private matchesFilters(filters: Record<string, any> | undefined, payload: any): boolean {
    if (!filters) return true;
    for (const key in filters) {
      if (payload[key] !== filters[key]) {
        return false;
      }
    }
    return true;
  }

  private sortRules(rules: Rule[]): void {
    const phaseOrder: Record<string, number> = { before: 0, normal: 1, after: 2 };
    
    rules.sort((a, b) => {
      const phaseA = phaseOrder[a.phase || 'normal'];
      const phaseB = phaseOrder[b.phase || 'normal'];
      
      if (phaseA !== phaseB) {
        return phaseA - phaseB; // Ordine crescente di fase (before -> normal -> after)
      }
      
      return (b.priority || 0) - (a.priority || 0); // Ordine decrescente di priorità
    });
  }
}