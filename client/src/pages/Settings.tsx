import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Save, User, Building2, FileText, Loader2, Upload, ImageIcon, X, Briefcase, Shield, Clock, PoundSterling } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRADE_SECTOR_OPTIONS } from "@/lib/tradeSectors";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and company details.
        </p>
      </div>

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

      {/* Day Work Rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="h-5 w-5" />
            Day Work Rates
          </CardTitle>
          <CardDescription>
            Rates for additional/varied work outside the quoted scope
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
    </div>
  );
}
