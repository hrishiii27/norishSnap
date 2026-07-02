import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.resolve(process.cwd(), 'ICMR-NIN_DS.md');
const outputPath = path.resolve(process.cwd(), 'js/data/icmr-database.json');

const content = fs.readFileSync(inputPath, 'utf-8');

const lines = content.split('\n');
const database = [];

const parseValue = (str) => {
  if (!str) return 0;
  const match = str.match(/^([\d\.]+)/);
  return match ? parseFloat(match[1]) : 0;
};

for (const line of lines) {
  if (line.startsWith('||**') || line.startsWith('|**')) {
    const parts = line.split('|').filter(Boolean);
    if (parts.length >= 3) {
      const metaStr = parts[0];
      const nameMatch = metaStr.match(/\*\*(.*?)\*\*/g);
      
      if (!nameMatch || nameMatch.length < 2) continue;
      
      const code = nameMatch[0].replace(/\*\*/g, '').trim();
      const nameRaw = nameMatch[1].replace(/\*\*/g, '').trim();

      const macroParts1 = parts[1].split('<br>');
      const macroParts2 = parts[2].split('<br>');

      if (macroParts1.length >= 4 && macroParts2.length >= 5) {
        const protein = parseValue(macroParts1[1]);
        const fat = parseValue(macroParts1[3]);
        
        const carbs = parseValue(macroParts2[3]);
        const energyKJ = parseValue(macroParts2[4]);
        const calories = Math.round(energyKJ / 4.184); // Convert kJ to kcal
        
        database.push({
          id: code,
          name: nameRaw,
          calories_per_100g: calories,
          protein_per_100g: protein,
          carbs_per_100g: carbs,
          fats_per_100g: fat
        });
      }
    }
  }
}

fs.writeFileSync(outputPath, JSON.stringify(database, null, 2), 'utf-8');
console.log(`Parsed ${database.length} food items from ICMR-NIN_DS.md into ${outputPath}`);
