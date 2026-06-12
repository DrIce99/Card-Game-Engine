import { validateGameDefinition } from '../validator/gameValidator';
import { GameDefinition } from '../types/gameDefinitions';

const myBrokenGame: GameDefinition = {
  engineVersion: "1.0.0",
  gameVersion: "1.0.0",
  gameId: "test",
  name: "Test Gioco Rotto",
  requiredPlugins: ["briscola"],
  config: {
    deck: { type: "french_40", shuffleOnInit: true },
    players: { min: 2, max: 2, mode: "individual" },
    zones: [{ id: "deck", name: "Mazzo", capacity: 40, visibility: "hidden" }], // Manca la zona "tavolo"
    variables: { global: ["round"], player: ["score"] } // Manca "puntiBonus"
  },
  rules: [
    {
      id: "rule_1",
      name: "Regola con errori",
      phase: "normal",
      priority: 10,
      trigger: { event: "CARD_PLAYED" },
      actions: [
        {
          type: "MOVE_CARD",
          source: { type: "auto", ref: "zone.tavolo" }, // ERRORE: zona inesistente
          destination: { type: "manual", prompt: "" }   // ERRORE: prompt vuoto
        },
        {
          type: "MODIFY_VARIABLE",
          scope: "player",
          varName: "puntiBonus", // ERRORE: variabile non dichiarata
          operation: "ADD",
          value: 10
        },
        {
          type: "EXECUTE_QUERY",
          query: "calcolaQualcosa",
          plugin: "poker", // ERRORE: plugin non in requiredPlugins
          args: [],
          assignToContext: "risultato"
        }
      ]
    }
  ]
};

const result = validateGameDefinition(myBrokenGame);

if (!result.isValid) {
  console.error("Validazione fallita:");
  result.errors.forEach(err => {
    console.log(`[${err.severity.toUpperCase()}] Regola: ${err.ruleId || 'N/A'} | Campo: ${err.field || 'N/A'} -> ${err.message}`);
  });
} else {
  console.log("Definizione valida!");
}