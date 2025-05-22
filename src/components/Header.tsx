import { Captions } from 'lucide-react';

export default function Header() {
  return (
    <header className="py-6 px-4 md:px-8 border-b">
      <div className="container mx-auto flex items-center gap-3">
        <Captions className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">LinguaClip</h1>
      </div>
    </header>
  );
}
