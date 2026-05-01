'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUp } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRight, ChevronDown } from 'lucide-react';
import { farmAcresOptions, type FarmAcres } from '@/lib/validation';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Farm info state
  const [farmName, setFarmName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [cropTypes, setCropTypes] = useState('');
  const [farmAcres, setFarmAcres] = useState<FarmAcres | ''>('');

  // Email verification state
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    // Validate farm fields
    if (!farmName.trim()) {
      setError('Farm name is required');
      setIsLoading(false);
      return;
    }

    const zipCodeRegex = /^\d{5}(-\d{4})?$/;
    if (!zipCodeRegex.test(zipCode)) {
      setError('Please enter a valid US ZIP code (e.g., 12345 or 12345-6789)');
      setIsLoading(false);
      return;
    }

    if (!cropTypes.trim()) {
      setError('Please describe the types of crops you grow');
      setIsLoading(false);
      return;
    }

    if (!farmAcres) {
      setError('Please select your farm size');
      setIsLoading(false);
      return;
    }

    try {
      const result = await signUp.email({
        email,
        password,
        name,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to create account');
      } else if (result.data?.user?.id) {
        // Save farm profile after successful signup
        try {
          const farmResponse = await fetch('/api/profile/farm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: result.data.user.id,
              farmName: farmName.trim(),
              zipCode,
              cropTypes: cropTypes.trim(),
              farmAcres,
            }),
          });

          if (!farmResponse.ok) {
            console.error('Failed to save farm profile');
            // Continue anyway - user can update farm info later
          }
        } catch (farmError) {
          console.error('Error saving farm profile:', farmError);
          // Continue anyway - user can update farm info later
        }

        // Show email verification prompt
        setUserEmail(email);
        setShowEmailVerification(true);
      } else {
        // Show email verification prompt even if we couldn't get user ID
        setUserEmail(email);
        setShowEmailVerification(true);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    router.push('/auth/sign-in');
    router.refresh();
  };

  // Social sign-in handlers commented out - not currently in use
  // const handleGoogleSignIn = async () => {
  //   setIsLoading(true);
  //   setError('');
  //
  //   try {
  //     await signIn.social({
  //       provider: 'google',
  //       callbackURL: '/account',
  //     });
  //   } catch {
  //     setError('Failed to sign in with Google');
  //     setIsLoading(false);
  //   }
  // };
  //
  // const handleAppleSignIn = async () => {
  //   setIsLoading(true);
  //   setError('');
  //
  //   try {
  //     await signIn.social({
  //       provider: 'apple',
  //       callbackURL: '/account',
  //     });
  //   } catch {
  //     setError('Failed to sign in with Apple');
  //     setIsLoading(false);
  //   }
  // };

  // Show email verification prompt after successful sign-up
  if (showEmailVerification) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">
              Check your email
            </h2>
            <p className="text-muted-foreground mb-2">
              We&apos;ve sent a verification link to:
            </p>
            <p className="font-medium mb-6">
              {userEmail}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Click the link in the email to verify your account and complete your registration.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Important:</strong> The verification link will expire in 24 hours.
              </p>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleContinue}
                className="w-full py-3 h-auto text-base"
              >
                Continue to Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Didn&apos;t receive the email? Check your spam folder or contact support.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Create an account</h1>
          <p className="text-muted-foreground">
            Join us to get started with your order
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          {/* Email Form */}
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Full name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password (min. 8 characters)"
                required
                minLength={8}
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                minLength={8}
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>

            {/* Farm Information Section */}
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">Farm Information</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="farmName" className="text-sm font-medium">
                    Farm Name
                  </label>
                  <input
                    id="farmName"
                    type="text"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    placeholder="Enter your farm name"
                    required
                    className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="zipCode" className="text-sm font-medium">
                    ZIP Code
                  </label>
                  <input
                    id="zipCode"
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="12345 or 12345-6789"
                    required
                    maxLength={10}
                    className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="cropTypes" className="text-sm font-medium">
                    Type of Crops
                  </label>
                  <textarea
                    id="cropTypes"
                    value={cropTypes}
                    onChange={(e) => setCropTypes(e.target.value)}
                    placeholder="Describe the types of crops you grow (e.g., corn, soybeans, wheat...)"
                    required
                    rows={3}
                    className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="farmAcres" className="text-sm font-medium">
                    Farm Size (Acres)
                  </label>
                  <div className="relative">
                    <select
                      id="farmAcres"
                      value={farmAcres}
                      onChange={(e) => setFarmAcres(e.target.value as FarmAcres)}
                      required
                      className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select farm size</option>
                      {farmAcresOptions.map((option) => (
                        <option key={option} value={option}>
                          {option} acres
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 h-auto text-base"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Create account'
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

