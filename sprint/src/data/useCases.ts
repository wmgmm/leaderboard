import prompts from '../../../web/prompts.json';
import type { Prompt } from '../../../shared/types';

// The cards are the leaderboard's workshop-ready prompts. web/prompts.json is the
// one source of their wording; nothing is retyped here.
export type Category =
  | 'Start here' | 'Write and rewrite' | 'Think it through' | 'Learn and explain'
  | 'Organise information' | "Learn AI's limits" | 'Data and code' | 'Just for you';

export interface UseCase {
  id: string; // the leaderboard's prompt id, such as p01 or x03
  cat: Category;
  title: string;
  desc: string;
  prompt: string;
  examples: string[]; // up to three things the [bracket] could be
  note: string; // one line the person needs, such as a caveat; often empty
  upload?: { icon: 'photo' | 'file' | 'sheet' | 'mic'; text: string } | null; // a short "or upload this" hint
}

export const useCases: UseCase[] = (prompts as unknown as Prompt[])
  .filter(p => p.ready)
  .map(p => ({
    id: p.id,
    cat: p.category as Category,
    title: `${p.title} ${p.emoji}`.trim(),
    desc: p.about,
    prompt: p.prompts[0].text,
    examples: p.examples,
    note: p.note,
    upload: p.upload,
  }));
