"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Card className="border-rose-300/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-100">
            <AlertTriangle className="h-5 w-5 text-rose-300" aria-hidden="true" />
            Something failed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The demo route hit an unexpected error. Try again or reset the mock data from the header.
          </p>
          <p className="rounded-md border border-rose-300/25 bg-rose-300/10 p-3 text-sm text-rose-100">
            {error.message}
          </p>
          <Button type="button" onClick={reset}>
            Retry
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
