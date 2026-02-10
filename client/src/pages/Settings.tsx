import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Save, User, Building2, FileText, Loader2, Upload, ImageIcon, X, Briefcase } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRADE_SECTOR_OPTIONS } from "@/lib/tradeSectors";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Settings() {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  
  // Form state
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [defaultTradeSector, setDefaultTradeSector] = useState("");
  const [defaultTerms, setDefaultTerms] = useState(
    "1. This quote is valid for 30 days from the date of issue.\n2. Payment terms: 50% deposit, 50% on completion.\n3. All prices are exclusive of VAT unless otherwise stated."
  );
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Update profile mutation
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
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
