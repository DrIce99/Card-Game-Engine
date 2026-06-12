// src/engine/conditionEvaluator.ts

import type {
  ConditionNode,
  CompositeCondition,
  SimpleCondition,
  QueryReference,
  StaticValue,
  ExecutionContext
} from '../types/gameDefinitions.js';

// Funzione che il motore principale passerà all'evaluator per risolvere le query
export type QueryResolver = (queryRef: QueryReference, context: ExecutionContext) => any;

/**
 * Valuta una condizione (semplice o composta) e restituisce true o false.
 * 
 * @param condition Il nodo della condizione da valutare
 * @param context Il contesto di esecuzione attuale (stato, evento, variabili temporanee)
 * @param resolveQuery La funzione fornita dal motore per eseguire le query
 * @returns true se la condizione è soddisfatta, false altrimenti
 */
export function evaluateCondition(
  condition: ConditionNode,
  context: ExecutionContext,
  resolveQuery: QueryResolver
): boolean {
  // 1. Gestione delle Condizioni Composte (AND / OR)
  if ('conditions' in condition) {
    const composite = condition as CompositeCondition;
    
    if (composite.operator === 'AND') {
      // Tutte le sotto-condizioni devono essere vere
      return composite.conditions.every(subCondition => 
        evaluateCondition(subCondition, context, resolveQuery)
      );
    } 
    
    if (composite.operator === 'OR') {
      // Almeno una sotto-condizione deve essere vera
      return composite.conditions.some(subCondition => 
        evaluateCondition(subCondition, context, resolveQuery)
      );
    }
    
    console.warn(`[ConditionEvaluator] Operatore composto sconosciuto: ${(composite as any).operator}`);
    return false;
  }

  // 2. Gestione delle Condizioni Semplici
  const simple = condition as SimpleCondition;

  // Caso speciale: operatori unari TRUE / FALSE
  if (simple.operator === 'TRUE') {
    return Boolean(resolveValue(simple.left, context, resolveQuery));
  }
  if (simple.operator === 'FALSE') {
    return !Boolean(resolveValue(simple.left, context, resolveQuery));
  }

  // Caso standard: confronto binario (EQ, GT, ecc.)
  const leftValue = resolveValue(simple.left, context, resolveQuery);
  const rightValue = resolveValue(simple.right, context, resolveQuery);

  return applyOperator(simple.operator, leftValue, rightValue);
}

/**
 * Risolve un valore che può essere statico o il risultato di una query.
 */
function resolveValue(
  value: QueryReference | StaticValue,
  context: ExecutionContext,
  resolveQuery: QueryResolver
): any {
  // Se è un oggetto con la proprietà 'query', è una QueryReference
  if (typeof value === 'object' && value !== null && 'query' in value) {
    try {
      return resolveQuery(value as QueryReference, context);
    } catch (error) {
      console.error(`[ConditionEvaluator] Errore durante l'esecuzione della query:`, error);
      // In caso di errore nella query, restituiamo null per evitare crash a cascata
      return null; 
    }
  }
  
  // Altrimenti è un valore statico (string, number, boolean, null)
  return value;
}

/**
 * Applica l'operatore di confronto tra due valori.
 * Include una gestione sicura per confronti tra tipi diversi (es. stringa vs numero).
 */
function applyOperator(operator: string, left: any, right: any): boolean {
  // Helper per normalizzare i valori numerici (gestisce stringhe che contengono numeri)
  const toNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  switch (operator) {
    case 'EQ':
      // Confronto lasso (==) per gestire "1" == 1, altrimenti strict (===)
      return left == right; 
    case 'NEQ':
      return left != right;
    case 'GT':
      return toNumber(left) > toNumber(right);
    case 'GTE':
      return toNumber(left) >= toNumber(right);
    case 'LT':
      return toNumber(left) < toNumber(right);
    case 'LTE':
      return toNumber(left) <= toNumber(right);
    default:
      console.warn(`[ConditionEvaluator] Operatore di confronto sconosciuto: ${operator}`);
      return false;
  }
}