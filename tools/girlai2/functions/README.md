# GirlAI2 Cloud Functions

Cloud Functions for handling LLM orchestration and chat responses.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables in Firebase:
```bash
firebase functions:config:set openai.api_key="YOUR_KEY"
firebase functions:config:set anthropic.api_key="YOUR_KEY"
firebase functions:config:set google.api_key="YOUR_KEY"
```

3. Build TypeScript:
```bash
npm run build
```

4. Deploy:
```bash
npm run deploy
```

## Functions

- `generateResponse`: HTTP callable function that generates AI responses using multi-LLM orchestration.
