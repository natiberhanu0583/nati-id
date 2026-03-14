'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, User, Coins, Mail } from 'lucide-react';

import { useSession } from '@/lib/auth-client';
import Link from 'next/link';

// Validation schema
const addPointsFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  points: z.coerce
    .number()
    .int('Points must be a whole number')
    .positive('Points must be positive')
    .min(1, 'Points must be at least 1')
    .max(1000000, 'Points cannot exceed 1,000,000'),
});

type AddPointsFormValues = z.infer<typeof addPointsFormSchema>;

const defaultValues: Partial<AddPointsFormValues> = {
  points: 10,
};

export default function AddPointsPage() {
  const [loading, setLoading] = useState(false);
  const [recentTransaction, setRecentTransaction] = useState<{message: string; success: boolean; email: string; points: number} | null>(null);
  const session = useSession()
  console.log(session, "session")



  const form = useForm<AddPointsFormValues>({
    resolver: zodResolver(addPointsFormSchema) as unknown,
    defaultValues,
  });

  async function onSubmit(data: AddPointsFormValues) {
    setLoading(true);
    try {
      const response = await fetch('/api/add-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok) {
        setRecentTransaction(result.user);
        alert(result.message)

        form.reset();
      } else {
        alert(result.error || 'Failed to add points')
      }
    } catch (error) {
      console.error('Error adding points:', error);
      alert('An error occurred while adding points. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (session && session?.data?.user?.id !== "A6uihg20B1gGIhrMp3Z7rwrLXCUEgfko") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">Forbidden</p>
        <Link href="/">Go Home</Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Add Points to User</h1>
        <p className="text-muted-foreground">
          Add points to user accounts using their email address
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Add Points Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Points
            </CardTitle>
            <CardDescription>
              Enter user email and points to add to their account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email Address
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="user@example.com"
                          {...field}
                          className="text-base py-2"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the user&apos;s registered email address
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="points"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Coins className="h-4 w-4" />
                        Points to Add
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="10"
                          {...field}
                          className="text-base py-2"
                        />
                      </FormControl>
                      <FormDescription>
                        Number of points to add (1-1,000,000)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding Points...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Points
                    </>
                  )}
                </Button>
                <Link className='font-bold w-full flex justify-center underline text-center' href="/">Go Home</Link>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Recent Transaction & Info */}
        <div className="space-y-6">
          {/* Recent Transaction */}
          {recentTransaction && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Last Transaction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">User:</span>
                  <span>{recentTransaction.email}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">New Balance:</span>
                  <Badge variant="secondary" className="text-lg">
                    <Coins className="h-4 w-4 mr-1" />
                    {recentTransaction.points} points
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common point amounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[10, 25, 50, 100].map((points) => (
                  <Button
                    key={points}
                    variant="outline"
                    onClick={() => form.setValue('points', points)}
                    type="button"
                  >
                    +{points}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>• Enter the exact email address of the user</p>
              <p>• Points will be added to their current balance</p>
              <p>• Users need points to process PDF files</p>
              <p>• Each PDF processing costs 1 point</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}