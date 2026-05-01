'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Wheat,
  Pencil,
  Check,
  X,
  Loader2,
  ChevronDown,
  MapPin,
  Sprout,
  LandPlot,
} from 'lucide-react';
import { farmAcresOptions, type FarmAcres } from '@/lib/validation';

interface FarmProfile {
  id: string;
  userId: string;
  farmName: string;
  zipCode: string;
  cropTypes: string;
  farmAcres: FarmAcres;
  createdAt: string;
  updatedAt: string;
}

export default function FarmPage() {
  const router = useRouter();
  const { user, isPending } = useAuth();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Farm profile state
  const [farmProfile, setFarmProfile] = useState<FarmProfile | null>(null);

  // Editing states
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    farmName: '',
    zipCode: '',
    cropTypes: '',
    farmAcres: '' as FarmAcres | '',
  });

  // Fetch farm profile
  const fetchFarmProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/profile/farm');
      if (response.ok) {
        const data = await response.json();
        setFarmProfile(data.farmProfile);
        if (data.farmProfile) {
          setFormData({
            farmName: data.farmProfile.farmName,
            zipCode: data.farmProfile.zipCode,
            cropTypes: data.farmProfile.cropTypes,
            farmAcres: data.farmProfile.farmAcres,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching farm profile:', err);
      setError('Failed to load farm information');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !user) {
      router.push('/auth/sign-in');
    }
    if (user) {
      fetchFarmProfile();
    }
  }, [user, isPending, router, fetchFarmProfile]);

  const handleSave = async () => {
    // Validate
    if (!formData.farmName.trim()) {
      setError('Farm name is required');
      return;
    }

    const zipCodeRegex = /^\d{5}(-\d{4})?$/;
    if (!zipCodeRegex.test(formData.zipCode)) {
      setError('Please enter a valid US ZIP code');
      return;
    }

    if (!formData.cropTypes.trim()) {
      setError('Please describe your crops');
      return;
    }

    if (!formData.farmAcres) {
      setError('Please select your farm size');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch('/api/profile/farm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmName: formData.farmName.trim(),
          zipCode: formData.zipCode,
          cropTypes: formData.cropTypes.trim(),
          farmAcres: formData.farmAcres,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFarmProfile(data.farmProfile);
        setIsEditing(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save farm information');
      }
    } catch (err) {
      console.error('Error saving farm profile:', err);
      setError('Failed to save farm information');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (farmProfile) {
      setFormData({
        farmName: farmProfile.farmName,
        zipCode: farmProfile.zipCode,
        cropTypes: farmProfile.cropTypes,
        farmAcres: farmProfile.farmAcres,
      });
    }
    setIsEditing(false);
    setError(null);
  };

  if (isPending || isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">My Farm</h1>
          <p className="text-muted-foreground mt-1">
            Manage your farm information
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Farm Information Card */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Wheat className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Farm Details</h2>
                  <p className="text-sm text-muted-foreground">Your farm information</p>
                </div>
              </div>
              {!isEditing && farmProfile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>

            {!farmProfile && !isEditing ? (
              <div className="text-center py-8">
                <Wheat className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">
                  No farm information on file.
                </p>
                <Button onClick={() => setIsEditing(true)}>
                  Add Farm Information
                </Button>
              </div>
            ) : isEditing ? (
              /* Edit Form */
              <div className="space-y-6">
                {/* Farm Name */}
                <div className="space-y-2">
                  <label htmlFor="farmName" className="text-sm font-medium flex items-center gap-2">
                    <Wheat className="h-4 w-4 text-muted-foreground" />
                    Farm Name
                  </label>
                  <input
                    id="farmName"
                    type="text"
                    value={formData.farmName}
                    onChange={(e) => setFormData({ ...formData, farmName: e.target.value })}
                    placeholder="Enter your farm name"
                    className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  />
                </div>

                {/* ZIP Code */}
                <div className="space-y-2">
                  <label htmlFor="zipCode" className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    ZIP Code
                  </label>
                  <input
                    id="zipCode"
                    type="text"
                    value={formData.zipCode}
                    onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    placeholder="12345 or 12345-6789"
                    maxLength={10}
                    className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  />
                </div>

                {/* Type of Crops */}
                <div className="space-y-2">
                  <label htmlFor="cropTypes" className="text-sm font-medium flex items-center gap-2">
                    <Sprout className="h-4 w-4 text-muted-foreground" />
                    Type of Crops
                  </label>
                  <textarea
                    id="cropTypes"
                    value={formData.cropTypes}
                    onChange={(e) => setFormData({ ...formData, cropTypes: e.target.value })}
                    placeholder="Describe the types of crops you grow..."
                    rows={4}
                    className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all resize-none"
                  />
                </div>

                {/* Farm Acres */}
                <div className="space-y-2">
                  <label htmlFor="farmAcres" className="text-sm font-medium flex items-center gap-2">
                    <LandPlot className="h-4 w-4 text-muted-foreground" />
                    Farm Size (Acres)
                  </label>
                  <div className="relative">
                    <select
                      id="farmAcres"
                      value={formData.farmAcres}
                      onChange={(e) => setFormData({ ...formData, farmAcres: e.target.value as FarmAcres })}
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

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Display Mode */
              <div className="space-y-6">
                {/* Farm Name */}
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Wheat className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Farm Name</div>
                    <div className="font-medium">{farmProfile?.farmName}</div>
                  </div>
                </div>

                {/* ZIP Code */}
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">ZIP Code</div>
                    <div className="font-medium">{farmProfile?.zipCode}</div>
                  </div>
                </div>

                {/* Type of Crops */}
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Sprout className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Type of Crops</div>
                    <div className="font-medium whitespace-pre-wrap">{farmProfile?.cropTypes}</div>
                  </div>
                </div>

                {/* Farm Size */}
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <LandPlot className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Farm Size</div>
                    <div className="font-medium">{farmProfile?.farmAcres} acres</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
