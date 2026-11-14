export type UserRole = 'ADMIN' | 'WHOLESALER' | 'RETAILER';

export type AccountStatus = 'active' | 'suspended' | 'rejected' | 'pending';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ListingStatus = 'draft' | 'published' | 'unpublished';
export type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'made_to_order';
export type SubscriptionStatus = 'active' | 'pending' | 'expired' | 'cancelled' | 'suspended';
export type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type FulfillmentType = 'delivery' | 'pickup';
export type PaymentMethod = 'cod' | 'upi_direct' | 'bank_transfer' | 'gateway_pending';
export type PaymentStatus = 'unpaid' | 'pending_verification' | 'verified_paid' | 'failed' | 'refunded';
export type StockMovementType = 'initial' | 'restock' | 'manual_reduction' | 'adjustment' | 'order_reserved' | 'order_restored';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  mobile: string;
  role: UserRole;
  account_status: AccountStatus;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  owner_id: string;
  business_type: 'WHOLESALER' | 'RETAILER';
  business_name: string;
  business_category: string;
  description: string | null;
  gst_number: string | null;
  logo_url: string | null;
  contact_person: string;
  contact_phone: string;
  contact_email: string | null;
  address: string;
  city: string;
  state: string;
  pin_code: string;
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  storage_path: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface Inventory {
  id: string;
  product_id: string;
  wholesaler_id: string;
  available_stock: number;
  reserved_stock: number;
  low_stock_threshold: number;
  updated_at: string;
}

export interface PricingTier {
  id: string;
  product_id: string;
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
}

export interface Product {
  id: string;
  wholesaler_id: string;
  business_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  name: string;
  description: string;
  brand: string | null;
  sku: string;
  wholesale_price: number;
  moq: number;
  unit: string;
  availability_status: AvailabilityStatus;
  listing_status: ListingStatus;
  is_removed: boolean;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  businesses?: Business | null;
  categories?: Category | null;
  subcategories?: Subcategory | null;
  product_images?: ProductImage[];
  inventory?: Inventory | Inventory[] | null;
  pricing_tiers?: PricingTier[];
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_inr: number;
  billing_cycle_days: number;
  grace_period_days: number;
  max_active_products: number;
  features: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  wholesaler_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  start_date: string | null;
  expiry_date: string | null;
  grace_until: string | null;
  expiry_notified: boolean;
  created_at: string;
  updated_at: string;
  subscription_plans?: SubscriptionPlan | null;
  profiles?: Profile | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Order {
  id: string;
  order_number: string;
  checkout_group_id: string;
  retailer_id: string;
  wholesaler_id: string;
  business_id: string;
  status: OrderStatus;
  total_amount: number;
  retailer_name: string;
  shop_name: string;
  contact_number: string;
  delivery_address: string;
  pin_code: string;
  fulfillment_type: FulfillmentType;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_notes: string | null;
  status_note: string | null;
  created_at: string;
  updated_at: string;
  businesses?: Business | null;
  order_items?: OrderItem[];
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  products?: Product | null;
}

export interface Enquiry {
  id: string;
  retailer_id: string;
  wholesaler_id: string;
  product_id: string | null;
  subject: string;
  message: string;
  reply_message: string | null;
  status: 'open' | 'replied' | 'closed';
  replied_at: string | null;
  created_at: string;
  products?: { id: string; name: string } | null;
  retailer_profile?: { full_name: string; email: string; mobile: string } | null;
  wholesaler_business?: { id: string; business_name: string } | null;
}

export interface PaymentRecord {
  id: string;
  payer_id: string;
  payee_id: string | null;
  payment_purpose: 'order_direct' | 'subscription';
  order_id: string | null;
  subscription_id: string | null;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: 'pending' | 'pending_verification' | 'verified' | 'rejected' | 'failed';
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'order' | 'enquiry' | 'subscription' | 'account' | 'moderation' | 'system';
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ProductReport {
  id: string;
  product_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewed' | 'action_taken' | 'dismissed';
  admin_notes: string | null;
  created_at: string;
  products?: { id: string; name: string; wholesaler_id: string; listing_status: string; is_removed: boolean } | null;
}

export interface StockMovement {
  id: string;
  product_id: string;
  wholesaler_id: string;
  change_amount: number;
  previous_stock: number;
  new_stock: number;
  movement_type: StockMovementType;
  reference_id: string | null;
  note: string | null;
  created_at: string;
  products?: { name: string; sku: string; unit: string } | null;
}
