import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, Store, Upload } from 'lucide-react';
import { MarketplaceLayout } from '../../layouts/MarketplaceLayout';
import { requireSupabase } from '../../lib/supabase';
import { extractErrorMessage } from '../../lib/formatters';
import { uploadUserImage, validateImageFile } from '../../lib/storage';
import { useAuth } from '../../context/AuthContext';

const INITIAL_BUSINESS_CATEGORIES = [
  'Grocery',
  'Electronics',
  'Mobile accessories',
  'Clothing',
  'Footwear',
  'Cosmetics',
  'Stationery',
  'Household products',
  'Kitchen products',
  'Packaging materials',
  'General merchandise',
];

export function RegisterPage() {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [accountType, setAccountType] = useState<'RETAILER' | 'WHOLESALER'>('RETAILER');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('General merchandise');
  const [description, setDescription] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleResendVerification = async () => {
    setResending(true);
    setResendMessage(null);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (resendErr) throw resendErr;
      setResendMessage(`A fresh verification link was sent to ${email.trim()}.`);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to resend verification email right now.'));
    } finally {
      setResending(false);
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setLogoFile(null);
      return;
    }
    const validationErr = validateImageFile(file);
    if (validationErr) {
      setError(validationErr);
      e.target.value = '';
      return;
    }
    setError(null);
    setLogoFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    if (!/^[0-9]{6}$/.test(pinCode.trim())) {
      setError('Please enter a valid 6-digit PIN code.');
      return;
    }

    setLoading(true);
    try {
      const supabase = requireSupabase();
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            full_name: fullName.trim(),
            mobile: mobile.trim(),
            role: accountType,
            business_name: businessName.trim(),
            business_category: businessCategory,
            description: description.trim(),
            gst_number: gstNumber.trim(),
            contact_person: (contactPerson || fullName).trim(),
            address: address.trim(),
            city: city.trim(),
            state: stateName.trim(),
            pin_code: pinCode.trim(),
          },
        },
      });

      if (signUpErr) throw signUpErr;

      // If Supabase returned an active session immediately (email confirmation disabled), upload logo if selected
      if (data.session && data.user) {
        if (logoFile && accountType === 'WHOLESALER') {
          try {
            const { publicUrl } = await uploadUserImage('business-logos', data.user.id, logoFile, 'logo');
            await supabase.from('businesses').update({ logo_url: publicUrl }).eq('owner_id', data.user.id);
          } catch {
            // Logo upload can also be completed later inside Profile settings
          }
        }
        await refreshProfile();
        navigate(accountType === 'WHOLESALER' ? '/wholesaler' : '/retailer', { replace: true });
        return;
      }

      setVerificationSent(true);
    } catch (err) {
      const rawMsg = extractErrorMessage(err, 'Registration failed. Please check your details and try again.');
      if (rawMsg.toLowerCase().includes('rate limit')) {
        setError(
          'Supabase free email limit reached (around 2-4 emails per hour). Wait 1 hour, OR turn OFF "Confirm email" in Supabase -> Authentication -> Providers -> Email (or connect Custom SMTP) so new accounts activate instantly.'
        );
      } else {
        setError(rawMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <MarketplaceLayout>
        <div className="max-w-lg mx-auto px-4 py-16">
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Verify Your Email Address</h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              We sent a verification link to <span className="font-semibold text-slate-900">{email}</span>.
              Click the link in your inbox to activate your {accountType.toLowerCase()} account, then sign in.
            </p>
            {resendMessage && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                {resendMessage}
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {error}
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                className="inline-flex items-center px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800"
              >
                Go to Sign In
              </Link>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending}
                className="inline-flex items-center px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60"
              >
                {resending ? 'Sending...' : 'Resend Link'}
              </button>
            </div>
          </div>
        </div>
      </MarketplaceLayout>
    );
  }

  return (
    <MarketplaceLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Register on OM – Open Market</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Create a verified B2B wholesaler or retailer account connected to the centralized marketplace.
          </p>

          {error && (
            <div className="mt-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* Account Type Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select Account Type <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType('RETAILER')}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                    accountType === 'RETAILER'
                      ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Store className="w-5 h-5 text-slate-800 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Retailer (Buyer)</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Free account to browse all approved wholesalers, compare bulk prices, and place orders.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAccountType('WHOLESALER')}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                    accountType === 'WHOLESALER'
                      ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Building2 className="w-5 h-5 text-slate-800 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Wholesaler (Seller)</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Publish wholesale catalogs, set bulk pricing tiers, and receive direct retailer orders.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Personal & Account Details */}
            <div className="pt-4 border-t border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 mb-4">Account & Contact Credentials</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Full Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Rajesh Sharma"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="reg-mobile" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Mobile Number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-mobile"
                    type="tel"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="e.g., +91 9876543210"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Business Email Address <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@yourbusiness.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="reg-pass" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-pass"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="reg-cpass" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Confirm Password <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-cpass"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Business / Shop Details */}
            <div className="pt-4 border-t border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                {accountType === 'WHOLESALER' ? 'Wholesaler Business Profile' : 'Retail Shop Information'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-biz-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                    {accountType === 'WHOLESALER' ? 'Business Name' : 'Shop Name'}{' '}
                    <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-biz-name"
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder={accountType === 'WHOLESALER' ? 'e.g., Shree Ganesh Distributors' : 'e.g., City Mart Retail'}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="reg-biz-cat" className="block text-sm font-medium text-slate-700 mb-1.5">
                    {accountType === 'WHOLESALER' ? 'Business Category' : 'Shop Category'}{' '}
                    <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="reg-biz-cat"
                    value={businessCategory}
                    onChange={(e) => setBusinessCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {INITIAL_BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {accountType === 'WHOLESALER' && (
                  <>
                    <div>
                      <label htmlFor="reg-contact-person" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Primary Contact Person <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="reg-contact-person"
                        type="text"
                        required
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder="Person managing trade orders"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-gst" className="block text-sm font-medium text-slate-700 mb-1.5">
                        GST Number (Optional)
                      </label>
                      <input
                        id="reg-gst"
                        type="text"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                        placeholder="e.g., 27AABCU9603R1ZM"
                        className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="reg-desc" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Business Description <span className="text-rose-600">*</span>
                      </label>
                      <textarea
                        id="reg-desc"
                        rows={3}
                        required
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe the wholesale lines you supply, dispatch regions, and minimum order policies..."
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="reg-logo" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Business Logo (Optional, JPG/PNG/WEBP up to 5MB)
                      </label>
                      <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                        <Upload className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">
                          {logoFile ? logoFile.name : 'Choose business logo file'}
                        </span>
                        <input
                          id="reg-logo"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleLogoSelect}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <label htmlFor="reg-address" className="block text-sm font-medium text-slate-700 mb-1.5">
                    {accountType === 'WHOLESALER' ? 'Business Address' : 'Shop Address'}{' '}
                    <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-address"
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Building, street, market area"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="reg-city" className="block text-sm font-medium text-slate-700 mb-1.5">
                    City <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-city"
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g., Surat"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="reg-state" className="block text-sm font-medium text-slate-700 mb-1.5">
                    State <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-state"
                    type="text"
                    required
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="e.g., Gujarat"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="reg-pin" className="block text-sm font-medium text-slate-700 mb-1.5">
                    PIN Code <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="reg-pin"
                    type="text"
                    required
                    maxLength={6}
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit PIN code"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              {loading
                ? 'Creating account...'
                : `Create ${accountType === 'WHOLESALER' ? 'Wholesaler' : 'Retailer'} Account`}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200 text-sm text-slate-600 text-center">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-slate-900 hover:underline">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </MarketplaceLayout>
  );
}
