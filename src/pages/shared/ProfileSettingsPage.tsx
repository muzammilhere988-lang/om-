import React, { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage } from '../../lib/formatters';
import { uploadUserImage, validateImageFile } from '../../lib/storage';
import { StatusBadge } from '../../components/common/StatusBadge';

export function ProfileSettingsPage() {
  const { user, profile, business, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [description, setDescription] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pinCode, setPinCode] = useState('');

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setMobile(profile.mobile || '');
    }
    if (business) {
      setBusinessName(business.business_name || '');
      setBusinessCategory(business.business_category || '');
      setDescription(business.description || '');
      setGstNumber(business.gst_number || '');
      setContactPerson(business.contact_person || '');
      setContactPhone(business.contact_phone || '');
      setAddress(business.address || '');
      setCity(business.city || '');
      setStateName(business.state || '');
      setPinCode(business.pin_code || '');
    }
  }, [profile, business]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setLogoFile(null);
      return;
    }
    const err = validateImageFile(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setLogoFile(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !profile) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const supabase = requireSupabase();
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          mobile: mobile.trim(),
        })
        .eq('id', user.id);

      if (profErr) throw profErr;

      if (business) {
        let nextLogoUrl = business.logo_url;
        if (logoFile) {
          const { publicUrl } = await uploadUserImage('business-logos', user.id, logoFile, 'logo');
          nextLogoUrl = publicUrl;
        }

        const { error: bizErr } = await supabase
          .from('businesses')
          .update({
            business_name: businessName.trim(),
            business_category: businessCategory.trim(),
            description: description.trim() || null,
            gst_number: gstNumber.trim() || null,
            contact_person: contactPerson.trim(),
            contact_phone: contactPhone.trim(),
            address: address.trim(),
            city: city.trim(),
            state: stateName.trim(),
            pin_code: pinCode.trim(),
            logo_url: nextLogoUrl,
          })
          .eq('id', business.id);

        if (bizErr) throw bizErr;
      }

      setLogoFile(null);
      await refreshProfile();
      setSuccessMsg('Profile and business information updated successfully.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to save profile changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Account & Business Profile">
      <div className="max-w-3xl bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-200">
          <div>
            <p className="text-xs text-slate-500">Account Role (Fixed)</p>
            <p className="text-base font-bold text-slate-900">{profile?.role}</p>
          </div>
          <div className="flex items-center gap-2">
            {profile && <StatusBadge status={profile.account_status} />}
            {business && profile?.role === 'WHOLESALER' && (
              <StatusBadge status={business.verification_status} />
            )}
          </div>
        </div>

        {error && (
          <div className="mt-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">{error}</div>
        )}
        {successMsg && (
          <div className="mt-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number *</label>
              <input
                type="tel"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {business && (
            <>
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {profile?.role === 'WHOLESALER' ? 'Business Name' : 'Shop Name'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
                  <input
                    type="text"
                    required
                    value={businessCategory}
                    onChange={(e) => setBusinessCategory(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person *</label>
                  <input
                    type="text"
                    required
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone *</label>
                  <input
                    type="tel"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                {profile?.role === 'WHOLESALER' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN (Optional)</label>
                      <input
                        type="text"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                        className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Business Description</label>
                      <textarea
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Address *</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">PIN Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Update Business Logo (JPG/PNG/WEBP up to 5MB)
                  </label>
                  <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-sm text-slate-600">
                    <Upload className="w-4 h-4" />
                    <span>{logoFile ? logoFile.name : 'Choose new logo image'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoChange}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            </>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
