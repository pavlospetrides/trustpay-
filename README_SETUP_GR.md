# TrustPay AI — σύντομη εκκίνηση

Το TrustPay τρέχει εξ ολοκλήρου με Node.js και TypeScript. Χρειάζεται Node.js 24, χωρίς Python ή δεύτερο backend.

```powershell
cd frontend
npm ci
npm run dev
```

Άνοιξε το http://127.0.0.1:3000. Το τοπικό demo χρησιμοποιεί μόνο συνθετικά δεδομένα SQLite. Το ίδιο Next.js process εξυπηρετεί και το `/api/health` και τα `/api/v1/*` endpoints.

Για το Supabase development mode, συμπλήρωσε το `frontend/.env.local` από το `frontend/.env.local.example` και ακολούθησε το [Supabase setup](docs/supabase-setup.md). Μην ανεβάζεις κωδικούς στο Git. Πραγματικές πληρωμές και live Jinius κλήσεις δεν υποστηρίζονται.
