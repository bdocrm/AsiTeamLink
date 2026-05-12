import { ReactNode } from 'react';

export default function ComplianceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Compliance & Auditing</h1>
          <p className="text-muted">Monitor user actions, deletions, and file operations</p>
        </div>
        {children}
      </div>
    </div>
  );
}
