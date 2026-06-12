# 🎴 Card Game Engine — Headless & Visual  
> Un motore visuale e completamente generalizzato per creare, simulare e testare giochi di carte tradizionali.

---

## 🚀 Visione Generale  
Il **Card Game Engine** è un ambiente ibrido composto da:

- **Modalità Costruzione** — Editor visuale a nodi per definire regole, trigger, condizioni e azioni.  
- **Modalità Test** — Simulatore runtime per eseguire partite, verificare logiche e fare debugging passo‑passo.

L’obiettivo è permettere anche a utenti non tecnici (giocatori, insegnanti, game designer) di **progettare giochi di carte senza scrivere codice**, sfruttando un DSL JSON e un motore headless completamente disaccoppiato dalla UI.

---

## 🧱 Architettura Teorica

### 🔌 1. Headless Core (Disaccoppiamento Totale)
Il Core Engine è **agnostico** rispetto a grafica, interfaccia e regole specifiche.  
La UI è solo una vista dello stato.

- Nessun accesso diretto a strutture interne (`state.zones.deck`).  
- Tutto passa tramite **Query Standardizzate**.

---

### 📄 2. DSL JSON (Definizione del Gioco)
L’intero regolamento è serializzato in un unico file JSON:

- Definizione statica del gioco  
- Separazione netta tra **configurazione** e **runtime effimero**  
- Validazione preventiva tramite compilatore interno

---

### ⚡ 3. Sistema Reattivo a Query
Il Rule Engine reagisce agli eventi e interroga lo stato tramite query:

- Nessun coupling con strutture interne  
- Ottimizzazione dei flussi  
- Facilità di estensione

---

### 🧩 4. Architettura a Plugin
Il motore è diviso in due livelli:

| Livello | Descrizione |
|--------|-------------|
| **Core Engine** | Gestisce ciclo di vita: Eventi → Valutazioni → Azioni |
| **Game Plugins** | Moduli esterni che registrano query/azioni personalizzate |

Esempio: `plugin-briscola.ts`.

---

### 🔁 5. Sistema Trigger / Condizioni / Azioni
Struttura modulare e dichiarativa:

- **Trigger** — intercettano eventi (es. `CARD_MOVED`)  
- **Condizioni** — nodi logici ad albero (`AND`, `OR`, ecc.)  
- **Azioni** — mutazioni atomiche ordinate per fase (`before`, `normal`, `after`) e priorità

---

### 🎯 6. Targeting Dinamico
Due categorie native:

- **Automatici** — derivati dal contesto dell’evento  
- **Manuali** — richiedono input esplicito dalla UI (pausa dell’engine)

---

### 🛡️ 7. Validazione Preventiva
Prima dell’avvio del runtime:

- Controllo integrità riferimenti  
- Verifica zone, variabili, plugin, query  
- Prevenzione errori logici prima dell’esecuzione

---

## 🧰 Stack Tecnologico

- **Node.js** — ambiente logico  
- **TypeScript** — tipizzazione rigida del DSL  
- **React** — UI e editor visuale  
- **Zustand** + **Immer** — stato immutabile e debug log  
- **React Flow** — editor a nodi  
- **`dnd-kit`** — drag & drop delle carte

---

# 🛠️ Installazione & Setup Ambiente

## 📌 Requisiti

- **Node.js LTS**  
- IDE consigliato: **Visual Studio Code**

---

## 📥 Installazione Passo‑Passo

### 1. Clonare il repository
```bash
git clone <url-del-repository>
cd card-game-engine
```

### 2. Inizializzare Node.js
```bash
npm init -y
```

### 3. Installare dipendenze di sviluppo
```bash
npm install -D typescript @types/node jest ts-jest @types/jest
```

### 4. Inizializzare TypeScript
```bash
npx tsc --init
```

### 5. Configurare Jest + TypeScript
```bash
npx ts-jest config:init
```

---

# 📂 Struttura delle Cartelle

```text
card-game-engine/
├── src/
│   ├── types/     # Interfacce TypeScript e definizione del DSL
│   ├── core/      # Core Engine headless
│   ├── plugins/   # Regole specifiche dei giochi
│   └── tests/     # Test automatizzati (Jest)
```

---

# 📘 Contributi & Linee Guida

- **Aggiungere un nuovo Plugin**  
- **Estendere il DSL**  
- **Scrivere Test Headless**  

---

# 📄 Licenza
Il progetto è rilasciato sotto licenza **MIT**.
