# 🥗 NourishSnap AI

![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?style=for-the-badge&logo=vercel)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

NourishSnap AI is the first intelligent nutrition tracker built specifically to navigate the complexities of **Indian cuisine**. Simply snap a photo or record a quick voice log of your meal, and the AI parses the ingredients and accurately maps them against the native **ICMR Database** to provide precise macro and micronutrient breakdowns.

---

## ✨ Features

- 📸 **Instant Vision AI Parsing:** Snap a picture of complex Indian dishes (like thalis, curries, or dals). The AI will break down the meal into distinct components and estimate serving sizes.
- 🎙️ **Voice Logging (Audio Snap):** In a rush? Just speak what you ate (e.g., "I had two chapatis and a katori of dal makhani") and the AI will log it instantly.
- 🇮🇳 **Native ICMR Database Integration:** Say goodbye to generic Western nutritional estimates. NourishSnap uses a curated dictionary of regional aliases alongside a dynamic fuzzy-matcher linked directly to the massive ICMR (Indian Council of Medical Research) database for unprecedented accuracy.
- ✏️ **Manual Controls & Adjustments:** Easily modify AI predictions, tweak serving sizes, delete items, or manually add custom dishes that the AI recalculates on the fly.
- 🔒 **Secure Authentication:** Built-in email/password, Google, and Apple sign-in options backed by Supabase.
- 📊 **Historical Tracking:** View an intuitive timeline of all your logged meals, grouped by date.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Bundler:** Vite
- **Backend / Auth / DB:** Supabase
- **AI Processing:** Custom AI Agents handling Image/Voice parsing & DB fuzzy-matching
- **Hosting:** Vercel

---

## 🚀 Getting Started

To run NourishSnap AI locally, follow these simple steps:

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/hrishiii27/norishSnap.git
   cd norishSnap
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   - Create a `.env` file in the root directory.
   - Copy the contents from `.env.example` and fill in your Supabase and API credentials:
     ```env
     VITE_SUPABASE_URL=your_supabase_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```
   *The app will be available at `http://localhost:5173`.*

---

## 📂 Project Structure

```text
├── index.html            # Main entry point and layout
├── style.css             # Core application styles
├── landing.css           # SaaS-style landing page styling
├── package.json          # Dependency management
├── js/
│   ├── app.js            # Main application logic and event binding
│   ├── auth/
│   │   └── auth.js       # Supabase authentication integration
│   ├── data/
│   │   ├── db.js                 # IndexedDB & Supabase data persistence
│   │   ├── food-dictionary.json  # Curated Indian dishes dictionary
│   │   └── icmr-database.json    # Raw ICMR database for fallback fuzzy matching
│   └── agents/
│       ├── vision-parser.js      # Handles image processing
│       ├── audio-parser.js       # Handles voice parsing
│       └── database-retriever.js # Fuzzy logic mapper for nutrition calculation
```

---

## 🤝 Contributing

Contributions are always welcome! If you have ideas for improving the fuzzy matching, expanding the food dictionary, or adding new features, feel free to open an issue or submit a pull request.

## 📝 License

This project is licensed under the MIT License.
