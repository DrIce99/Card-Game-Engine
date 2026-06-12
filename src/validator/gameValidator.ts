// src/validator/gameValidator.ts

import type { 
  GameDefinition, 
  ConditionNode, 
  Action, 
  TargetReference, 
  QueryReference,
  SimpleCondition,
  CompositeCondition
} from '../types/gameDefinitions.js';

export interface ValidationError {
  ruleId?: string;      // ID della regola che ha generato l'errore (se applicabile)
  field?: string;       // Percorso del campo errato (es: "actions[0].destination.ref")
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Valida l'intera definizione del gioco.
 * Restituisce un oggetto con isValid e un array di errori.
 */
export function validateGameDefinition(definition: GameDefinition): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Validazione di base
  if (!definition.engineVersion || !definition.gameVersion) {
    errors.push({ message: "engineVersion e gameVersion sono obbligatori", severity: "error" });
  }

  if (!definition.config || !definition.config.zones || !definition.config.variables) {
    errors.push({ message: "La sezione 'config' con 'zones' e 'variables' è obbligatoria", severity: "error" });
    return { isValid: false, errors }; // Impossibile continuare senza config
  }

  // Prepariamo i Set per la ricerca rapida (O(1))
  const validZoneIds = new Set(definition.config.zones.map(z => z.id));
  const validGlobalVars = new Set(definition.config.variables.global || []);
  const validPlayerVars = new Set(definition.config.variables.player || []);
  const validPlugins = new Set([...(definition.requiredPlugins || []), "core"]); // "core" è sempre valido

  // 2. Validazione delle Regole
  if (definition.rules && Array.isArray(definition.rules)) {
    definition.rules.forEach(rule => {
      validateRule(rule, validZoneIds, validGlobalVars, validPlayerVars, validPlugins, errors);
    });
  }

  return {
    isValid: errors.filter(e => e.severity === "error").length === 0,
    errors
  };
}

// ----------------------------------------------------------------------------
// Funzioni Helper di Validazione
// ----------------------------------------------------------------------------

function validateRule(
  rule: any, // Usiamo any qui per gestire gracefully oggetti malformati
  validZoneIds: Set<string>,
  validGlobalVars: Set<string>,
  validPlayerVars: Set<string>,
  validPlugins: Set<string>,
  errors: ValidationError[]
) {
  const ruleId = rule.id || "unknown_rule";

  if (!rule.trigger || !rule.trigger.event) {
    errors.push({ ruleId, field: "trigger.event", message: "Ogni regola deve avere un evento di trigger", severity: "error" });
  }

  if (rule.phase && !["before", "normal", "after"].includes(rule.phase)) {
    errors.push({ ruleId, field: "phase", message: `Fase non valida: ${rule.phase}. Usare 'before', 'normal' o 'after'`, severity: "error" });
  }

  // Validazione Condizione (Ricorsiva)
  if (rule.condition) {
    validateCondition(rule.condition, ruleId, validPlugins, errors);
  }

  // Validazione Azioni
  if (rule.actions && Array.isArray(rule.actions)) {
    rule.actions.forEach((action: Action, index: number) => {
      validateAction(action, ruleId, `actions[${index}]`, validZoneIds, validGlobalVars, validPlayerVars, validPlugins, errors);
    });
  }
}

function validateCondition(
  condition: ConditionNode,
  ruleId: string,
  validPlugins: Set<string>,
  errors: ValidationError[]
) {
  if ('conditions' in condition) {
    // È una CompositeCondition
    const composite = condition as CompositeCondition;
    if (!composite.conditions || composite.conditions.length === 0) {
      errors.push({ ruleId, field: "condition", message: "Una condizione composta (AND/OR) deve avere almeno una sotto-condizione", severity: "error" });
    } else {
      composite.conditions.forEach((subCondition) => {
        validateCondition(subCondition, ruleId, validPlugins, errors); 
      });
    }
  } else {
    // È una SimpleCondition
    const simple = condition as SimpleCondition;
    validateQueryReference(simple.left, ruleId, "condition.left", validPlugins, errors);
    validateQueryReference(simple.right, ruleId, "condition.right", validPlugins, errors);
  }
}

function validateAction(
  action: Action,
  ruleId: string,
  fieldPrefix: string,
  validZoneIds: Set<string>,
  validGlobalVars: Set<string>,
  validPlayerVars: Set<string>,
  validPlugins: Set<string>,
  errors: ValidationError[]
) {
  if (!action || !action.type) {
    errors.push({ ruleId, field: fieldPrefix, message: "Azione malformata: manca il campo 'type'", severity: "error" });
    return;
  }

  switch (action.type) {
    case "MOVE_CARD":
      validateTarget(action.source, ruleId, `${fieldPrefix}.source`, validZoneIds, errors);
      validateTarget(action.destination, ruleId, `${fieldPrefix}.destination`, validZoneIds, errors);
      break;

    case "MODIFY_VARIABLE":
      if (!action.varName) {
        errors.push({ ruleId, field: `${fieldPrefix}.varName`, message: "Il nome della variabile è obbligatorio", severity: "error" });
      } else {
        const isGlobal = validGlobalVars.has(action.varName);
        const isPlayer = validPlayerVars.has(action.varName);
        
        if (!isGlobal && !isPlayer) {
          errors.push({ 
            ruleId, 
            field: `${fieldPrefix}.varName`, 
            message: `La variabile '${action.varName}' non è dichiarata in config.variables (global o player)`, 
            severity: "error" 
          });
        }
      }
      
      if (action.value && typeof action.value === 'object' && 'query' in action.value) {
        validateQueryReference(action.value as QueryReference, ruleId, `${fieldPrefix}.value`, validPlugins, errors);
      }
      break;

    case "EXECUTE_QUERY":
      if (!action.query) {
        errors.push({ ruleId, field: `${fieldPrefix}.query`, message: "Il nome della query è obbligatorio", severity: "error" });
      }
      if (action.plugin && !validPlugins.has(action.plugin)) {
        errors.push({ 
          ruleId, 
          field: `${fieldPrefix}.plugin`, 
          message: `Il plugin '${action.plugin}' non è presente in requiredPlugins`, 
          severity: "error" 
        });
      }
      if (!action.assignToContext) {
        errors.push({ ruleId, field: `${fieldPrefix}.assignToContext`, message: "assignToContext è obbligatorio per EXECUTE_QUERY", severity: "warning" });
      }
      break;

    case "END_GAME":
      if (action.winner) {
        validateTarget(action.winner, ruleId, `${fieldPrefix}.winner`, validZoneIds, errors);
      }
      break;
      
    case "EMIT_EVENT":
      if (!action.eventName) {
        errors.push({ ruleId, field: `${fieldPrefix}.eventName`, message: "eventName è obbligatorio per EMIT_EVENT", severity: "error" });
      }
      break;
  }
}

function validateTarget(
  target: TargetReference | undefined,
  ruleId: string,
  fieldPrefix: string,
  validZoneIds: Set<string>,
  errors: ValidationError[]
) {
  if (!target) {
    errors.push({ ruleId, field: fieldPrefix, message: "Il target è obbligatorio", severity: "error" });
    return;
  }

  if (target.type === "manual") {
    if (!target.prompt) {
      errors.push({ ruleId, field: `${fieldPrefix}.prompt`, message: "Un target manuale deve avere un 'prompt' per l'utente", severity: "error" });
    }
  } else if (target.type === "auto") {
    if (!target.ref) {
      errors.push({ ruleId, field: `${fieldPrefix}.ref`, message: "Un target automatico deve avere un 'ref'", severity: "error" });
    } else {
      // Validazione euristica dei riferimenti noti
      if (target.ref.startsWith("zone.")) {
        const zoneId = target.ref.substring(5); // Rimuove "zone."
        if (!validZoneIds.has(zoneId)) {
          errors.push({ 
            ruleId, 
            field: `${fieldPrefix}.ref`, 
            message: `La zona di riferimento '${zoneId}' non esiste nella configurazione`, 
            severity: "error" 
          });
        }
      }
    }
  }
}

function validateQueryReference(
  ref: QueryReference | any,
  ruleId: string,
  fieldPrefix: string,
  validPlugins: Set<string>,
  errors: ValidationError[]
) {
  // Se è un valore statico (string, number, boolean, null), non c'è nulla da validare qui
  if (typeof ref !== 'object' || ref === null || !('query' in ref)) {
    return;
  }

  const queryRef = ref as QueryReference;
  if (!queryRef.query) {
    errors.push({ ruleId, field: fieldPrefix, message: "Una QueryReference deve avere un nome di 'query'", severity: "error" });
  }

  if (queryRef.plugin && !validPlugins.has(queryRef.plugin)) {
    errors.push({ 
      ruleId, 
      field: `${fieldPrefix}.plugin`, 
      message: `Il plugin '${queryRef.plugin}' richiesto dalla query non è in requiredPlugins`, 
      severity: "error" 
    });
  }
}