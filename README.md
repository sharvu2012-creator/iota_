# Satellite Watch

A satellite data education platform for exploring Earth observation data — zero setup, zero install, zero sign-in.

## Quick Start

```bash
# Clone this repository
git clone https://github.com/your-username/satellite-watch.git
cd satellite-watch

# Install dependencies (if any server-side dependencies needed)
npm install

# Create environment file
cp .env.example .env
# Add your Gemini API key to .env

# Start locally
npm start
```

## Deploy to Vercel

1. Push this repository to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click **Add New → Project** → Import your GitHub repo
4. Click **Deploy**
5. Go to **Settings → Environment Variables** and add:
   - `GEMINI_API_KEY` = your Gemini API key

## Project Structure

```
satellite-watch/
├── public/
│   ├── index.html          # Main page
│   ├── css/
│   │   └── style.css       # All styling
│   ├── js/
│   │   └── app.js          # Main application logic
│   ├── data/
│   │   └── results.json    # Sample AI analysis results
│   └── api/
│       └── explain.js      → Vercel serverless function
├── .env.example
├── .gitignore
├── package.json
└── vercel.json
```

## How It Works

1. **Satellite Map**: Explore Earth using free satellite imagery (Esri World Imagery)
2. **Dual Assessment**: AI-generated quizzes about satellite imagery concepts
3. **AI Tutor**: Ask questions about satellite imagery and get AI-generated explanations
4. **Gamified Roadmap**: Progress through lessons with XP and star rewards
5. **Teacher Dashboard**: Live roster for classrooms (multi-teacher support)

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no build step)
- **Map**: Leaflet.js + Esri World Imagery
- **AI Tutor**: Google Gemini (via serverless proxy)
- **Hosting**: Vercel
