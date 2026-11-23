# TrustPay AI — Codex Frontend Kit

This kit contains the two exact user-provided 21.dev reference texts and a custom Codex implementation brief tailored to the existing TrustPay Python/FastAPI MVP.

## Windows setup — βήμα βήμα

1. Κράτησε backup του υπάρχοντος project `trustpay-ai-mvp` (ή βάλε το σε Git). ΜΗΝ διαγράψεις τον Python φάκελο.
2. Κάνε extract **τα περιεχόμενα** του kit ZIP μέσα στο υπάρχον `trustpay-ai-mvp` folder, δίπλα στο `app/`, `web/`, `tests/`, `README.md`. Μετά πρέπει να υπάρχουν:

```
trustpay-ai-mvp/
  app/
  web/
  tests/
  CODEX_FRONTEND_MASTER_PROMPT.md
  README_SETUP_GR.md
  design-references/
    21dev-glassy-dashboard.txt
    21dev-liquid-glass-checkout.txt
```

3. Άνοιξε τον ίδιο φάκελο στο VS Code ή στο Codex workspace. Στείλε στο Codex την εντολή:

> Read and implement `CODEX_FRONTEND_MASTER_PROMPT.md` in this project. Both source files are inside `design-references/`. Inspect the current FastAPI backend first. Implement the frontend and run the checks; do not stop at planning.

4. Το Codex θα δημιουργήσει το `frontend/` και θα σου δώσει τις ακριβείς εντολές εκκίνησης.

## Ενδεικτική εκκίνηση μετά την υλοποίηση (δύο terminals)

**Terminal A — FastAPI (από root του project):**

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal B — Next.js:**

```powershell
cd frontend
npm install
npm run dev
```

**URL:** http://localhost:3000 (frontend), http://127.0.0.1:8000/docs (backend API documentation).

Χρειάζεσαι εγκατεστημένο Node.js LTS και Python 3.11+. Αν δεν λειτουργεί το `python` command, μπορείς να εκτελέσεις τον πλήρη Python path που εγκατέστησες, ή να διορθώσεις το PATH.

## Product rules

- Απαγορεύεται να εμφανίζεται ότι στάλθηκαν πραγματικά χρήματα.
- Τα raw credit-card / CVC πεδία από το 21.dev Liquid Checkout **δεν ανήκουν** στο προϊόν και πρέπει να αφαιρεθούν.
- Το frontend χρησιμοποιεί τα πραγματικά local FastAPI endpoints, όχι demo values ως πηγή αλήθειας.
- Καμία νέα Jinius API endpoint URL δεν πρέπει να εφευρεθεί.
- Μην εκθέσεις τον υπάρχοντα μη-authenticated demo server σε public internet.
