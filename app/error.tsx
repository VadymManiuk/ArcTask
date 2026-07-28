"use client";

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
          <CardTitle className="text-rose-100">Something failed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The page hit an unexpected error. Try the action again.
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
