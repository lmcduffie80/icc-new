'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { PhoneInput } from '@/components/ui/phone-input';
import { StateSelect } from '@/components/ui/state-select';
import {
  ArrowLeft,
  User,
  MapPin,
  Phone,
  Camera,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Upload,
} from 'lucide-react';

interface Address {
  id: string;
  label: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isPrimary: boolean;
}

interface Profile {
  id: string;
  userId: string;
  phone: string | null;
  name: string | null;
  email: string;
  image: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isPending, refetch: refetchAuth } = useAuth();

  // Loading states
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);

  // Basic info state
  const [name, setName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  // Phone state
  const [phone, setPhone] = useState('');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [tempPhone, setTempPhone] = useState('');

  // Addresses state
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<Address, 'id' | 'isPrimary'>>({
    label: '',
    fullName: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
  });

  // Fetch profile data
  const fetchProfile = useCallback(async () => {
    try {
      setIsLoadingProfile(true);
      const response = await fetch('/api/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
        setName(data.profile.name || '');
        setTempName(data.profile.name || '');
        setPhone(data.profile.phone || '');
        setTempPhone(data.profile.phone || '');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  // Fetch addresses
  const fetchAddresses = useCallback(async () => {
    try {
      setIsLoadingAddresses(true);
      const response = await fetch('/api/profile/addresses');
      if (response.ok) {
        const data = await response.json();
        setAddresses(data.addresses);
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
    } finally {
      setIsLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !user) {
      router.push('/auth/sign-in');
    }
    if (user) {
      fetchProfile();
      fetchAddresses();
    }
  }, [user, isPending, router, fetchProfile, fetchAddresses]);

  if (isPending || isLoadingProfile) {
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

  const handleSaveName = async () => {
    try {
      setIsSavingName(true);
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tempName }),
      });

      if (response.ok) {
        const data = await response.json();
        setName(data.profile.name || '');
        setProfile(data.profile);
        setIsEditingName(false);
      }
    } catch (error) {
      console.error('Error saving name:', error);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelName = () => {
    setTempName(name);
    setIsEditingName(false);
  };

  const handleSavePhone = async () => {
    try {
      setIsSavingPhone(true);
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: tempPhone }),
      });

      if (response.ok) {
        const data = await response.json();
        setPhone(data.profile.phone || '');
        setProfile(data.profile);
        setIsEditingPhone(false);
      }
    } catch (error) {
      console.error('Error saving phone:', error);
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleCancelPhone = () => {
    setTempPhone(phone);
    setIsEditingPhone(false);
  };

  const handleAddAddress = async () => {
    try {
      setIsSavingAddress(true);
      const response = await fetch('/api/profile/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addressForm),
      });

      if (response.ok) {
        await fetchAddresses();
        setAddressForm({
          label: '',
          fullName: name,
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'United States',
        });
        setIsAddingAddress(false);
      }
    } catch (error) {
      console.error('Error adding address:', error);
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleEditAddress = (address: Address) => {
    setEditingAddressId(address.id);
    setAddressForm({
      label: address.label,
      fullName: address.fullName,
      street: address.street,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country,
    });
  };

  const handleUpdateAddress = async () => {
    if (!editingAddressId) return;

    try {
      setIsSavingAddress(true);
      const response = await fetch(`/api/profile/addresses/${editingAddressId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addressForm),
      });

      if (response.ok) {
        await fetchAddresses();
        setEditingAddressId(null);
        setAddressForm({
          label: '',
          fullName: name,
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'United States',
        });
      }
    } catch (error) {
      console.error('Error updating address:', error);
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      const response = await fetch(`/api/profile/addresses/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchAddresses();
      }
    } catch (error) {
      console.error('Error deleting address:', error);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      const response = await fetch(`/api/profile/addresses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });

      if (response.ok) {
        await fetchAddresses();
      }
    } catch (error) {
      console.error('Error setting primary address:', error);
    }
  };

  const handleCancelAddressForm = () => {
    setIsAddingAddress(false);
    setEditingAddressId(null);
    setAddressForm({
      label: '',
      fullName: name,
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
    });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('File size must be less than 2MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Please upload a JPEG, PNG, GIF, or WebP image');
      return;
    }

    setUploadError(null);
    setIsUploadingImage(true);

    try {
      // Step 1: Get presigned URL
      const presignResponse = await fetch('/api/profile/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: file.type,
          fileName: file.name,
          size: file.size,
        }),
      });

      if (!presignResponse.ok) {
        const error = await presignResponse.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      const { uploadUrl, publicUrl } = await presignResponse.json();

      // Step 2: Upload to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      // Step 3: Update profile with new image URL
      const updateResponse = await fetch('/api/profile/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update profile');
      }

      // Refresh profile data and auth session
      await fetchProfile();
      await refetchAuth();
    } catch (error) {
      console.error('Error uploading image:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setIsUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async () => {
    if (!profile?.image) return;

    setIsUploadingImage(true);
    setUploadError(null);

    try {
      const response = await fetch('/api/profile/upload', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove image');
      }

      // Refresh profile data and auth session
      await fetchProfile();
      await refetchAuth();
    } catch (error) {
      console.error('Error removing image:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to remove image');
    } finally {
      setIsUploadingImage(false);
    }
  };

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
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-muted-foreground mt-1">
            Manage your personal information
          </p>
        </div>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Basic Information</h2>
                <p className="text-sm text-muted-foreground">Your personal details</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Profile Picture */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="relative h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    {isUploadingImage ? (
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    ) : profile?.image ? (
                      <Image
                        src={profile.image}
                        alt={name}
                        fill
                        sizes="80px"
                        className="rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl font-semibold text-primary">
                        {name?.charAt(0).toUpperCase() || profile?.email?.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div>
                  <div className="font-medium">Profile Picture</div>
                  <div className="text-sm text-muted-foreground">
                    JPG, PNG, GIF, or WebP. Max 2MB.
                  </div>
                  {uploadError && (
                    <div className="text-sm text-destructive mt-1">{uploadError}</div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                    >
                      {isUploadingImage ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Photo
                        </>
                      )}
                    </Button>
                    {profile?.image && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveImage}
                        disabled={isUploadingImage}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div className="flex items-center justify-between py-4 border-t border-border">
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground mb-1">Full Name</div>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <Button size="sm" onClick={handleSaveName} disabled={isSavingName}>
                        {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancelName} disabled={isSavingName}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{name || 'Not set'}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingName(true)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between py-4 border-t border-border">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Email Address</div>
                  <div className="font-medium">{profile?.email}</div>
                </div>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                  Cannot be changed
                </span>
              </div>
            </div>
          </div>

          {/* Phone Number */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Phone Number</h2>
                <p className="text-sm text-muted-foreground">Used for order updates and delivery</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              {isEditingPhone ? (
                <div className="flex items-center gap-2 flex-1">
                  <PhoneInput
                    value={tempPhone}
                    onChange={(value) => setTempPhone(value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <Button size="sm" onClick={handleSavePhone} disabled={isSavingPhone}>
                    {isSavingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelPhone} disabled={isSavingPhone}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="font-medium">{phone || 'Not set'}</div>
                    {!phone && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Add a phone number to receive SMS updates about your orders
                      </div>
                    )}
                  </div>
                  <Button
                    variant={phone ? 'ghost' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setTempPhone(phone);
                      setIsEditingPhone(true);
                    }}
                  >
                    {phone ? (
                      <>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Phone
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Shipping Addresses */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Shipping Addresses</h2>
                  <p className="text-sm text-muted-foreground">Manage your delivery addresses</p>
                </div>
              </div>
              {!isAddingAddress && !editingAddressId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddressForm({
                      label: '',
                      fullName: name,
                      street: '',
                      city: '',
                      state: '',
                      zipCode: '',
                      country: 'United States',
                    });
                    setIsAddingAddress(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Address
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {/* Address Form */}
              {(isAddingAddress || editingAddressId) && (
                <div className="p-4 rounded-lg border border-primary/50 bg-primary/5">
                  <h3 className="font-medium mb-4">
                    {isAddingAddress ? 'Add New Address' : 'Edit Address'}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="address-label" className="block text-sm text-muted-foreground mb-1">
                        Label (e.g., Home, Work)
                      </label>
                      <input
                        id="address-label"
                        type="text"
                        value={addressForm.label}
                        onChange={(e) =>
                          setAddressForm((prev) => ({ ...prev, label: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="Home"
                      />
                    </div>
                    <div>
                      <label htmlFor="address-fullname" className="block text-sm text-muted-foreground mb-1">
                        Full Name
                      </label>
                      <input
                        id="address-fullname"
                        type="text"
                        value={addressForm.fullName}
                        onChange={(e) =>
                          setAddressForm((prev) => ({ ...prev, fullName: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="address-street" className="block text-sm text-muted-foreground mb-1">
                        Street Address
                      </label>
                      <input
                        id="address-street"
                        type="text"
                        value={addressForm.street}
                        onChange={(e) =>
                          setAddressForm((prev) => ({ ...prev, street: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="123 Main St, Apt 4"
                      />
                    </div>
                    <div>
                      <label htmlFor="address-city" className="block text-sm text-muted-foreground mb-1">
                        City
                      </label>
                      <input
                        id="address-city"
                        type="text"
                        value={addressForm.city}
                        onChange={(e) =>
                          setAddressForm((prev) => ({ ...prev, city: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="address-state" className="block text-sm text-muted-foreground mb-1">
                          State
                        </label>
                        <StateSelect
                          id="address-state"
                          value={addressForm.state}
                          onChange={(value) =>
                            setAddressForm((prev) => ({ ...prev, state: value }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label htmlFor="address-zipcode" className="block text-sm text-muted-foreground mb-1">
                          ZIP Code
                        </label>
                        <input
                          id="address-zipcode"
                          type="text"
                          value={addressForm.zipCode}
                          onChange={(e) =>
                            setAddressForm((prev) => ({ ...prev, zipCode: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          placeholder="94102"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="address-country" className="block text-sm text-muted-foreground mb-1">
                        Country
                      </label>
                      <select
                        id="address-country"
                        value={addressForm.country}
                        onChange={(e) =>
                          setAddressForm((prev) => ({ ...prev, country: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="United States">United States</option>
                        <option value="Canada">Canada</option>
                        <option value="United Kingdom">United Kingdom</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={handleCancelAddressForm} disabled={isSavingAddress}>
                      Cancel
                    </Button>
                    <Button
                      onClick={isAddingAddress ? handleAddAddress : handleUpdateAddress}
                      disabled={!addressForm.street || !addressForm.city || !addressForm.state || !addressForm.zipCode || !addressForm.label || !addressForm.fullName || isSavingAddress}
                    >
                      {isSavingAddress ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        isAddingAddress ? 'Add Address' : 'Save Changes'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Address List */}
              {isLoadingAddresses ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : addresses.length === 0 && !isAddingAddress ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No shipping addresses saved</p>
                  <p className="text-sm mt-1">Add an address for faster checkout</p>
                </div>
              ) : (
                addresses.map((address) => (
                  <div
                    key={address.id}
                    className={`p-4 rounded-lg border ${
                      address.isPrimary
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{address.label}</span>
                          {address.isPrimary && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div>{address.fullName}</div>
                          <div>{address.street}</div>
                          <div>
                            {address.city}, {address.state} {address.zipCode}
                          </div>
                          <div>{address.country}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!address.isPrimary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetPrimary(address.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Set as Primary
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditAddress(address)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAddress(address.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
