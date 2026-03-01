import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Save, User, Building2, FileText, Loader2, Upload, ImageIcon, X, Briefcase, Shield, Clock, PoundSterling, CreditCard, Users, Crown, AlertTriangle, Trash2, Mail, UserPlus, Check, ArrowRight, XCircle, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TRADE_SECTOR_OPTIONS } from "@/lib/tradeSectors";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export default function Settings() {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  
  // Form state — basic profile
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [defaultTradeSector, setDefaultTradeSector] = useState("");
  const [defaultTerms, setDefaultTerms] = useState(
    "1. This quote is valid for 30 days from the date of issue.\n2. Payment terms: 50% deposit, 50% on completion.\n3. All prices are exclusive of VAT unless otherwise stated."
  );

  // Form state — trade defaults (from organization)
  const [workingHoursStart, setWorkingHoursStart] = useState("08:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("16:30");
  const [workingDays, setWorkingDays] = useState("Monday to Friday");
  const [insuranceEmployers, setInsuranceEmployers] = useState("");
  const [insurancePublic, setInsurancePublic] = useState("");
  const [insuranceProfessional, setInsuranceProfessional] = useState("");
  const [dayWorkLabourRate, setDayWorkLabourRate] = useState("");
  const [dayWorkMaterialMarkup, setDayWorkMaterialMarkup] = useState("");
  const [dayWorkPlantMarkup, setDayWorkPlantMarkup] = useState("");
  const [defaultExclusions, setDefaultExclusions] = useState("");
  const [validityDays, setValidityDays] = useState("30");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryPosition, setSignatoryPosition] = useState("");
  const [surfaceTreatment, setSurfaceTreatment] = useState("");
  const [returnVisitRate, setReturnVisitRate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch organization profile for trade defaults
  const { data: orgProfile } = trpc.auth.orgProfile.useQuery();

  // Load user data into form
  useEffect(() => {
    if (user) {
      setCompanyName(user.companyName || "");
      setCompanyAddress(user.companyAddress || "");
      setCompanyPhone(user.companyPhone || "");
      setCompanyEmail(user.companyEmail || "");
      setCompanyLogo(user.companyLogo || null);
      setDefaultTradeSector((user as any).defaultTradeSector || "");
      if (user.defaultTerms) {
        setDefaultTerms(user.defaultTerms);
      }
    }
  }, [user]);

  // Load org trade defaults
  useEffect(() => {
    if (orgProfile) {
      const org = orgProfile as any;
      if (org.defaultWorkingHoursStart) setWorkingHoursStart(org.defaultWorkingHoursStart);
      if (org.defaultWorkingHoursEnd) setWorkingHoursEnd(org.defaultWorkingHoursEnd);
      if (org.defaultWorkingDays) setWorkingDays(org.defaultWorkingDays);
      if (org.defaultInsuranceLimits) {
        const ins = org.defaultInsuranceLimits as any;
        setInsuranceEmployers(ins.employers || "");
        setInsurancePublic(ins.public || "");
        setInsuranceProfessional(ins.professional || "");
      }
      if (org.defaultDayWorkRates) {
        const dw = org.defaultDayWorkRates as any;
        setDayWorkLabourRate(dw.labourRate?.toString() || "");
        setDayWorkMaterialMarkup(dw.materialMarkup?.toString() || "");
        setDayWorkPlantMarkup(dw.plantMarkup?.toString() || "");
      }
      if (org.defaultExclusions) setDefaultExclusions(org.defaultExclusions);
      if (org.defaultValidityDays) setValidityDays(org.defaultValidityDays.toString());
      if (org.defaultSignatoryName) setSignatoryName(org.defaultSignatoryName);
      if (org.defaultSignatoryPosition) setSignatoryPosition(org.defaultSignatoryPosition);
      if (org.defaultSurfaceTreatment) setSurfaceTreatment(org.defaultSurfaceTreatment);
      if (org.defaultReturnVisitRate) setReturnVisitRate(org.defaultReturnVisitRate);
      if (org.defaultPaymentTerms) setPaymentTerms(org.defaultPaymentTerms);
    }
  }, [orgProfile]);

  // Update profile mutation
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      utils.auth.orgProfile.invalidate();
      toast.success("Settings saved");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save settings");
    },
  });

  // Upload logo mutation
  const uploadLogo = trpc.auth.uploadLogo.useMutation({
    onSuccess: (data) => {
      setCompanyLogo(data.url);
      utils.auth.me.invalidate();
      toast.success("Logo uploaded");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload logo");
    },
  });

  const handleSave = async () => {
    updateProfile.mutate({
      companyName: companyName || undefined,
      companyAddress: companyAddress || undefined,
      companyPhone: companyPhone || undefined,
      companyEmail: companyEmail || undefined,
      defaultTerms: defaultTerms || undefined,
      defaultTradeSector: defaultTradeSector || undefined,
      // Trade defaults
      defaultWorkingHoursStart: workingHoursStart || undefined,
      defaultWorkingHoursEnd: workingHoursEnd || undefined,
      defaultWorkingDays: workingDays || undefined,
      defaultInsuranceLimits: (insuranceEmployers || insurancePublic || insuranceProfessional) ? {
        employers: insuranceEmployers || undefined,
        public: insurancePublic || undefined,
        professional: insuranceProfessional || undefined,
      } : undefined,
      defaultDayWorkRates: (dayWorkLabourRate || dayWorkMaterialMarkup || dayWorkPlantMarkup) ? {
        labourRate: dayWorkLabourRate ? parseFloat(dayWorkLabourRate) : undefined,
        materialMarkup: dayWorkMaterialMarkup ? parseFloat(dayWorkMaterialMarkup) : undefined,
        plantMarkup: dayWorkPlantMarkup ? parseFloat(dayWorkPlantMarkup) : undefined,
      } : undefined,
      defaultExclusions: defaultExclusions || undefined,
      defaultValidityDays: validityDays ? parseInt(validityDays) : undefined,
      defaultSignatoryName: signatoryName || undefined,
      defaultSignatoryPosition: signatoryPosition || undefined,
      defaultSurfaceTreatment: surfaceTreatment || undefined,
      defaultReturnVisitRate: returnVisitRate || undefined,
      defaultPaymentTerms: paymentTerms || undefined,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, GIF, or WebP image");
      return;
    }

    // Validate file size (max 2MB for logos)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be less than 2MB");
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadLogo.mutate({
        filename: file.name,
        contentType: file.type,
        base64Data: base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    updateProfile.mutate({
      companyLogo: "",
    });
    setCompanyLogo(null);
    toast.success("Logo removed");
  };

  // Tab state from URL params
  const [location, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState(urlParams.get('tab') || 'profile');

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `/settings?tab=${tab}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account, billing, and team.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b">
        {[
          { id: 'profile', label: 'Profile', icon: User },
          { id: 'billing', label: 'Billing', icon: CreditCard },
          { id: 'team', label: 'Team', icon: Users },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Billing Tab */}
      {activeTab === 'billing' && <BillingTab />}

      {/* Team Tab */}
      {activeTab === 'team' && <TeamTab />}

      {/* Profile Tab - existing content */}
      {activeTab === 'profile' && (
      <>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={user?.name || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Company Logo
          </CardTitle>
          <CardDescription>
            Your logo will appear on all quote PDFs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            {/* Logo Preview */}
            <div className="w-40 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 relative overflow-hidden">
              {companyLogo ? (
                <>
                  <img
                    src={companyLogo}
                    alt="Company Logo"
                    className="max-w-full max-h-full object-contain p-2"
                  />
                  <button
                    onClick={handleRemoveLogo}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                    title="Remove logo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <div className="text-center text-muted-foreground text-sm">
                  <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-50" />
                  No logo
                </div>
              )}
            </div>

            {/* Upload Button */}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLogo.isPending}
              >
                {uploadLogo.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload Logo
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, GIF, or WebP. Max 2MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Details
          </CardTitle>
          <CardDescription>
            These details will appear on your quotes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              placeholder="Your Company Ltd"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyAddress">Address</Label>
            <Textarea
              id="companyAddress"
              placeholder="123 Business Street&#10;London&#10;SW1A 1AA"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyPhone">Phone</Label>
              <Input
                id="companyPhone"
                placeholder="+44 20 1234 5678"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyEmail">Email</Label>
              <Input
                id="companyEmail"
                type="email"
                placeholder="quotes@yourcompany.com"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Business Sector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Default Business Sector
          </CardTitle>
          <CardDescription>
            Your default sector for comprehensive quotes. You can still override this when creating individual quotes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={defaultTradeSector} onValueChange={setDefaultTradeSector}>
            <SelectTrigger id="defaultTradeSector">
              <SelectValue placeholder="Select your business sector..." />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {TRADE_SECTOR_OPTIONS.map((sector) => (
                <SelectItem key={sector.value} value={sector.value}>
                  {sector.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Quote Defaults — Signatory & Validity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Quote Defaults
          </CardTitle>
          <CardDescription>
            These details appear on every quote. The AI will use them instead of generating placeholders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="signatoryName">Signatory Name</Label>
              <Input
                id="signatoryName"
                placeholder="e.g. Andrew Wright"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signatoryPosition">Position / Title</Label>
              <Input
                id="signatoryPosition"
                placeholder="e.g. Estimator"
                value={signatoryPosition}
                onChange={(e) => setSignatoryPosition(e.target.value)}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="validityDays">Quote Validity (days)</Label>
              <Input
                id="validityDays"
                type="number"
                placeholder="30"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surfaceTreatment">Default Surface Treatment</Label>
              <Input
                id="surfaceTreatment"
                placeholder="e.g. Shop primed (SB + zinc phosphate + MIO)"
                value={surfaceTreatment}
                onChange={(e) => setSurfaceTreatment(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="returnVisitRate">Return Visit Rate</Label>
            <Input
              id="returnVisitRate"
              placeholder="e.g. £856/day per 2-man team"
              value={returnVisitRate}
              onChange={(e) => setReturnVisitRate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Working Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Working Hours
          </CardTitle>
          <CardDescription>
            Standard site working hours included in quotes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workingHoursStart">Start Time</Label>
              <Input
                id="workingHoursStart"
                type="time"
                value={workingHoursStart}
                onChange={(e) => setWorkingHoursStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workingHoursEnd">End Time</Label>
              <Input
                id="workingHoursEnd"
                type="time"
                value={workingHoursEnd}
                onChange={(e) => setWorkingHoursEnd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workingDays">Days</Label>
              <Input
                id="workingDays"
                placeholder="Monday to Friday"
                value={workingDays}
                onChange={(e) => setWorkingDays(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insurance Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Insurance Limits
          </CardTitle>
          <CardDescription>
            Standard insurance indemnity limits stated on quotes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="insuranceEmployers">Employers Liability</Label>
              <Input
                id="insuranceEmployers"
                placeholder="e.g. £10 million"
                value={insuranceEmployers}
                onChange={(e) => setInsuranceEmployers(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insurancePublic">Public Liability</Label>
              <Input
                id="insurancePublic"
                placeholder="e.g. £5 million"
                value={insurancePublic}
                onChange={(e) => setInsurancePublic(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insuranceProfessional">Professional Indemnity</Label>
              <Input
                id="insuranceProfessional"
                placeholder="e.g. £2 million"
                value={insuranceProfessional}
                onChange={(e) => setInsuranceProfessional(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="h-5 w-5" />
            Work Rates
          </CardTitle>
          <CardDescription>
            Default rates, markups, and labour costs used across your quotes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dayWorkLabourRate">Labour Rate (£/hr)</Label>
              <Input
                id="dayWorkLabourRate"
                type="number"
                step="0.50"
                placeholder="e.g. 53.50"
                value={dayWorkLabourRate}
                onChange={(e) => setDayWorkLabourRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dayWorkMaterialMarkup">Material Markup (%)</Label>
              <Input
                id="dayWorkMaterialMarkup"
                type="number"
                placeholder="e.g. 32"
                value={dayWorkMaterialMarkup}
                onChange={(e) => setDayWorkMaterialMarkup(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dayWorkPlantMarkup">Plant Markup (%)</Label>
              <Input
                id="dayWorkPlantMarkup"
                type="number"
                placeholder="e.g. 18"
                value={dayWorkPlantMarkup}
                onChange={(e) => setDayWorkPlantMarkup(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standard Exclusions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Standard Exclusions
          </CardTitle>
          <CardDescription>
            Items you always exclude from quotes. One per line. The AI will include these on every quote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={"e.g.\nSecondary steelwork where section sizes not provided\nWind posts\nBuilder's work (cutting out, padstones, grouting, dry packing)\nTemporary propping\nIntumescent painting\nDiamond drilling\nMaking good to existing"}
            value={defaultExclusions}
            onChange={(e) => setDefaultExclusions(e.target.value)}
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Payment Terms */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="h-5 w-5" />
            Default Payment Terms
          </CardTitle>
          <CardDescription>
            Specific payment terms for your trade (overrides generic T&Cs for payment section)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g. Monthly valuations, payment 35 days from due date. 5% retention until practical completion."
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Default Terms */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Default Terms & Conditions
          </CardTitle>
          <CardDescription>
            These terms will be pre-filled on new quotes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter your default terms and conditions..."
            value={defaultTerms}
            onChange={(e) => setDefaultTerms(e.target.value)}
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>

      <Separator />

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={logout}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}

// ============ BILLING TAB ============

function BillingTab() {
  const [, setLocation] = useLocation();
  const { data: sub, isLoading, refetch: refetchSub } = trpc.subscription.status.useQuery();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const createPortal = trpc.subscription.createPortal.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const cancelSubscription = trpc.subscription.cancel.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled. You'll retain access until the end of your billing period.");
      setShowCancelDialog(false);
      refetchSub();
    },
    onError: (err) => {
      toast.error(err.message);
      setShowCancelDialog(false);
    },
  });

  const resumeSubscription = trpc.subscription.resume.useMutation({
    onSuccess: () => {
      toast.success("Subscription resumed! You're back on track.");
      refetchSub();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sub) return null;

  const tierColors: Record<string, string> = {
    trial: '#0d9488',
    solo: '#0d9488',
    pro: '#3b82f6',
    team: '#059669',
    business: '#d97706',
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" style={{ color: tierColors[sub.tier] || '#0d9488' }} />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border-2" style={{ borderColor: tierColors[sub.tier] || '#e5e7eb' }}>
            <div>
              <h3 className="text-xl font-bold" style={{ color: tierColors[sub.tier] }}>{sub.tierName}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {sub.tier === 'trial' ? (
                  sub.isTrialExpired
                    ? 'Trial expired — choose a plan to continue'
                    : `Free trial — ${sub.trialDaysRemaining} day${sub.trialDaysRemaining !== 1 ? 's' : ''} remaining`
                ) : sub.cancelAtPeriodEnd ? (
                  `Cancels on ${new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                ) : (
                  `Active — renews ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`
                )}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setLocation('/pricing')}
            >
              {sub.tier === 'trial' || sub.isTrialExpired ? 'Choose a Plan' : 'Change Plan'}
            </Button>
          </div>

          {/* Limit warning alert */}
          {sub.maxQuotesPerMonth !== -1 && sub.currentQuoteCount >= sub.maxQuotesPerMonth && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border-2 border-red-200">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">
                  You've reached your monthly quote limit
                </p>
                <p className="text-xs text-red-600 mt-1">
                  You've used all {sub.maxQuotesPerMonth} quotes included in your {sub.tierName} plan this month. 
                  Upgrade to create more quotes.
                </p>
                <Button
                  size="sm"
                  className="mt-2 text-xs"
                  style={{ backgroundColor: '#0d9488' }}
                  onClick={() => setLocation('/pricing')}
                >
                  Upgrade Plan <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Approaching limit warning (80%+) */}
          {sub.maxQuotesPerMonth !== -1 && sub.currentQuoteCount >= Math.floor(sub.maxQuotesPerMonth * 0.8) && sub.currentQuoteCount < sub.maxQuotesPerMonth && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  You're approaching your monthly quote limit
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  {sub.currentQuoteCount} of {sub.maxQuotesPerMonth} quotes used. Consider upgrading to avoid interruption.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs"
                  onClick={() => setLocation('/pricing')}
                >
                  View Plans
                </Button>
              </div>
            </div>
          )}

          {/* Team member limit warning */}
          {sub.currentUsers >= sub.maxUsers && sub.maxUsers > 1 && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <Users className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  All team seats are taken
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  {sub.currentUsers} of {sub.maxUsers} seats used. Upgrade to add more team members.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs"
                  onClick={() => setLocation('/pricing')}
                >
                  View Plans
                </Button>
              </div>
            </div>
          )}

          {/* Usage */}
          {sub.maxQuotesPerMonth !== -1 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Quotes this month</span>
                <span className="font-medium">{sub.currentQuoteCount} / {sub.maxQuotesPerMonth}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (sub.currentQuoteCount / sub.maxQuotesPerMonth) * 100)}%`,
                    backgroundColor: sub.currentQuoteCount >= sub.maxQuotesPerMonth ? '#ef4444' : tierColors[sub.tier],
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Team members</span>
            <span className="font-medium">{sub.currentUsers} / {sub.maxUsers}</span>
          </div>
        </CardContent>
      </Card>

      {/* Manage Billing */}
      {sub.hasStripeCustomer && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Manage Billing
            </CardTitle>
            <CardDescription>
              Update payment method, view invoices, or manage your subscription
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => createPortal.mutate()}
              disabled={createPortal.isPending}
            >
              {createPortal.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Open Billing Portal
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Manage your subscription through Stripe's secure portal
            </p>
          </CardContent>
        </Card>
      )}

      {/* Resume subscription — shown when subscription is cancelling */}
      {sub.cancelAtPeriodEnd && sub.hasActiveSubscription && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800">Your subscription is set to cancel</h4>
                <p className="text-sm text-amber-700 mt-1">
                  Your {sub.tierName} plan will end on{' '}
                  <strong>
                    {sub.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'the end of your billing period'}
                  </strong>.
                  After that, you won't be able to create new quotes or access premium features.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => resumeSubscription.mutate()}
                    disabled={resumeSubscription.isPending}
                    style={{ backgroundColor: '#0d9488' }}
                  >
                    {resumeSubscription.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    Resume Subscription
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel subscription — shown for paid active subscriptions that are NOT already cancelling */}
      {sub.tier !== 'trial' && sub.hasActiveSubscription && !sub.cancelAtPeriodEnd && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              Cancel Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              If you cancel, your {sub.tierName} plan will remain active until the end of your current billing period. You can resume at any time before then.
            </p>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={() => setShowCancelDialog(true)}
            >
              Cancel Subscription
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your {sub.tierName} subscription?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Your subscription will remain active until{' '}
                  <strong>
                    {sub.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'the end of your billing period'}
                  </strong>.
                  After that:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>You won't be able to create new quotes</li>
                  <li>Existing quotes and data will be preserved</li>
                  <li>You can resume your plan at any time before the end date</li>
                  <li>You won't be charged again unless you resubscribe</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubscription.isPending}>Keep My Plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancelSubscription.mutate();
              }}
              disabled={cancelSubscription.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {cancelSubscription.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cancelling...
                </>
              ) : (
                'Yes, Cancel Subscription'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trial info card */}
      {sub.tier === 'trial' && !sub.isTrialExpired && (
        <Card className="border-teal-200 bg-teal-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-teal-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-teal-800">Your trial is active</h4>
                <p className="text-sm text-teal-700 mt-1">
                  You have full access to Solo features for {sub.trialDaysRemaining} more day{sub.trialDaysRemaining !== 1 ? 's' : ''}. 
                  No credit card required — only enter card details after 14 days if you're happy. We know you'll love it.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ TEAM TAB ============

function TeamTab() {
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');

  const { data: sub } = trpc.subscription.status.useQuery();
  const { data: teamMembers, refetch: refetchTeam } = trpc.subscription.teamMembers.useQuery();

  const inviteMember = trpc.subscription.inviteTeamMember.useMutation({
    onSuccess: () => {
      toast.success('Team member added');
      setInviteEmail('');
      refetchTeam();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const removeMember = trpc.subscription.removeTeamMember.useMutation({
    onSuccess: () => {
      toast.success('Team member removed');
      refetchTeam();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const changeRole = trpc.subscription.changeTeamMemberRole.useMutation({
    onSuccess: () => {
      toast.success('Role updated');
      refetchTeam();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMember.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const canManageTeam = sub && sub.tier !== 'solo' && sub.tier !== 'trial';
  const isAtLimit = sub && sub.currentUsers >= sub.maxUsers;

  return (
    <div className="space-y-6">
      {/* Team info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            {sub ? `${sub.currentUsers} of ${sub.maxUsers} seats used on your ${sub.tierName} plan` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tier restriction message */}
          {(sub?.tier === 'solo' || sub?.tier === 'trial') && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {sub.tier === 'trial' ? 'Trial' : 'Solo'} plan — single user only
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Upgrade to Pro (2 users), Team (5 users), or Business (10 users) to invite team members.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs"
                  onClick={() => window.location.href = '/pricing'}
                >
                  View Plans
                </Button>
              </div>
            </div>
          )}

          {/* Member list */}
          <div className="divide-y">
            {teamMembers?.map((member: any) => (
              <div key={member.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                    {member.name?.charAt(0)?.toUpperCase() || member.email?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.name || member.email}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.role === 'owner' ? (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">Owner</span>
                  ) : (
                    <>
                      <Select
                        value={member.role}
                        onValueChange={(val) => changeRole.mutate({ memberId: member.memberId, role: val as 'admin' | 'member' })}
                        disabled={!canManageTeam}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                      {canManageTeam && member.userId !== user?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMember.mutate({ memberId: member.memberId })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invite form */}
      {canManageTeam && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite Team Member
            </CardTitle>
            <CardDescription>
              {isAtLimit
                ? `You've reached your ${sub?.maxUsers}-user limit. Upgrade for more seats.`
                : 'Add a new member to your organisation'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex gap-3">
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={!!isAtLimit}
                className="flex-1"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'member' | 'admin')} disabled={!!isAtLimit}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={!!isAtLimit || inviteMember.isPending || !inviteEmail.trim()}>
                {inviteMember.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">
              The user must already have an IdoYourQuotes account. They'll be added to your organisation immediately.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
