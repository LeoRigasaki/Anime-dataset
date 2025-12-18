# AnimeScheduleAgent Frontend

Next.js frontend for the AnimeScheduleAgent.

## Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Requirements

The FastAPI backend must be running on `http://localhost:8000`

```bash
# In the project root, run:
python -m uvicorn api.main:app --reload
```

## Environment Variables

Create `.env.local` to customize the API URL:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
# Test auto-deploy Thu Dec 18 23:52:30 PKT 2025
