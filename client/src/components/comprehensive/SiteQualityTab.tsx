import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  HardHat,
  Loader2,
  Sparkles,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Pencil,
  Save,
  X,
  Plus,
  Check,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SiteQualityTabProps {
  quoteId: number;
  config: any;
  refetch: () => void;
}

export default function SiteQualityTab({ quoteId, config, refetch }: SiteQualityTabProps) {
  const [isPopulating, setIsPopulating] = useState(false);

  // Editing states
  const [editingSite, setEditingSite] = useState(false);
  const [editingQuality, setEditingQuality] = useState(false);
  const [editingTechnical, setEditingTechnical] = useState(false);

  // Save indicators
  const [siteSaved, setSiteSaved] = useState(false);
  const [qualitySaved, setQualitySaved] = useState(false);
  const [technicalSaved, setTechnicalSaved] = useState(false);

  const populateReviewForms = trpc.quotes.populateReviewForms.useMutation({
    onMutate: () => setIsPopulating(true),
    onSuccess: () => {
      toast.success("Review forms populated from tender documents");
      setIsPopulating(false);
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to populate forms: " + error.message);
      setIsPopulating(false);
    },
  });

  const updateSection = trpc.quotes.updateComprehensiveSection.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const siteData = config?.sections?.siteRequirements?.data;
  const qualityData = config?.sections?.qualityCompliance?.data;
  const technicalData = config?.sections?.technicalReview?.data;
  const hasSiteEnabled = config?.sections?.siteRequirements?.enabled;
  const hasQualityEnabled = config?.sections?.qualityCompliance?.enabled;
  const hasTechnicalEnabled = config?.sections?.technicalReview?.enabled;

  const hasAnyData = siteData || qualityData || technicalData;

  // ─── SITE REQUIREMENTS EDIT STATE ───
  const [siteWorkingHoursStart, setSiteWorkingHoursStart] = useState(siteData?.workingHours?.start || "");
  const [siteWorkingHoursEnd, setSiteWorkingHoursEnd] = useState(siteData?.workingHours?.end || "");
  const [siteWorkingHoursDays, setSiteWorkingHoursDays] = useState(siteData?.workingHours?.days || "");
  const [siteAccessRestrictions, setSiteAccessRestrictions] = useState<string[]>(siteData?.accessRestrictions || []);
  const [siteSafetyRequirements, setSiteSafetyRequirements] = useState<string[]>(siteData?.safetyRequirements || []);
  const [sitePermitNeeds, setSitePermitNeeds] = useState<string[]>(siteData?.permitNeeds || []);
  const [siteConstraints, setSiteConstraints] = useState<string[]>(siteData?.constraints || []);

  const resetSiteState = () => {
    setSiteWorkingHoursStart(siteData?.workingHours?.start || "");
    setSiteWorkingHoursEnd(siteData?.workingHours?.end || "");
    setSiteWorkingHoursDays(siteData?.workingHours?.days || "");
    setSiteAccessRestrictions(siteData?.accessRestrictions || []);
    setSiteSafetyRequirements(siteData?.safetyRequirements || []);
    setSitePermitNeeds(siteData?.permitNeeds || []);
    setSiteConstraints(siteData?.constraints || []);
  };

  const handleSaveSite = async () => {
    const updatedData = {
      workingHours: {
        start: siteWorkingHoursStart,
        end: siteWorkingHoursEnd,
        days: siteWorkingHoursDays,
      },
      accessRestrictions: siteAccessRestrictions.filter(Boolean),
      safetyRequirements: siteSafetyRequirements.filter(Boolean),
      permitNeeds: sitePermitNeeds.filter(Boolean),
      constraints: siteConstraints.filter(Boolean),
    };

    await updateSection.mutateAsync({
      quoteId,
      section: "siteRequirements",
      data: updatedData,
    });

    setEditingSite(false);
    setSiteSaved(true);
    toast.success("Site requirements saved");
    setTimeout(() => setSiteSaved(false), 2000);
  };

  // ─── QUALITY COMPLIANCE EDIT STATE ───
  const [qualityStandards, setQualityStandards] = useState<string[]>(qualityData?.requiredStandards || []);
  const [qualityCertifications, setQualityCertifications] = useState<Array<{ name: string; required: boolean }>>(
    qualityData?.certifications || []
  );
  const [qualityInspectionPoints, setQualityInspectionPoints] = useState<Array<{ phase: string; description: string }>>(
    qualityData?.inspectionPoints || []
  );

  const resetQualityState = () => {
    setQualityStandards(qualityData?.requiredStandards || []);
    setQualityCertifications(qualityData?.certifications || []);
    setQualityInspectionPoints(qualityData?.inspectionPoints || []);
  };

  const handleSaveQuality = async () => {
    const updatedData = {
      requiredStandards: qualityStandards.filter(Boolean),
      certifications: qualityCertifications.filter((c) => c.name),
      inspectionPoints: qualityInspectionPoints.filter((p) => p.phase || p.description),
    };

    await updateSection.mutateAsync({
      quoteId,
      section: "qualityCompliance",
      data: updatedData,
    });

    setEditingQuality(false);
    setQualitySaved(true);
    toast.success("Quality compliance saved");
    setTimeout(() => setQualitySaved(false), 2000);
  };

  // ─── TECHNICAL REVIEW EDIT STATE ───
  const [techMaterialTypes, setTechMaterialTypes] = useState<Array<{ item: string; specification: string; grade?: string; quantity?: string }>>(
    technicalData?.materialTypes || []
  );
  const [techSpecialRequirements, setTechSpecialRequirements] = useState<string[]>(technicalData?.specialRequirements || []);
  const [techInspectionRequirements, setTechInspectionRequirements] = useState<string[]>(technicalData?.inspectionRequirements || []);

  const resetTechnicalState = () => {
    setTechMaterialTypes(technicalData?.materialTypes || []);
    setTechSpecialRequirements(technicalData?.specialRequirements || []);
    setTechInspectionRequirements(technicalData?.inspectionRequirements || []);
  };

  const handleSaveTechnical = async () => {
    const updatedData = {
      materialTypes: techMaterialTypes.filter((m) => m.item || m.specification),
      specialRequirements: techSpecialRequirements.filter(Boolean),
      inspectionRequirements: techInspectionRequirements.filter(Boolean),
    };

    await updateSection.mutateAsync({
      quoteId,
      section: "technicalReview",
      data: updatedData,
    });

    setEditingTechnical(false);
    setTechnicalSaved(true);
    toast.success("Technical review saved");
    setTimeout(() => setTechnicalSaved(false), 2000);
  };

  // ─── HELPER: Editable string list ───
  const EditableStringList = ({
    items,
    setItems,
    placeholder,
    icon,
  }: {
    items: string[];
    setItems: (items: string[]) => void;
    placeholder: string;
    icon?: React.ReactNode;
  }) => (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          {icon && <div className="mt-2.5 shrink-0">{icon}</div>}
          <Input
            value={item}
            onChange={(e) => {
              const newItems = [...items];
              newItems[index] = e.target.value;
              setItems(newItems);
            }}
            placeholder={placeholder}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setItems(items.filter((_, i) => i !== index))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setItems([...items, ""])}
      >
        <Plus className="h-3 w-3 mr-1" /> Add
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* AI Populate Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => populateReviewForms.mutate({ quoteId })}
          disabled={isPopulating}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
        >
          {isPopulating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {hasAnyData ? "Re-populate from Tender" : "Populate from Tender Documents"}
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TECHNICAL REVIEW */}
      {/* ═══════════════════════════════════════════════════════ */}
      {hasTechnicalEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Technical Review
                {technicalSaved && <Check className="h-4 w-4 text-green-600" />}
              </div>
              {technicalData && !editingTechnical && (
                <Button variant="ghost" size="sm" onClick={() => { resetTechnicalState(); setEditingTechnical(true); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Material specifications, special requirements, and inspection points.
            </p>
          </CardHeader>
          <CardContent>
            {!technicalData && !editingTechnical ? (
              <div className="text-center py-6 text-muted-foreground">
                <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No technical review data yet. Click "Populate from Tender Documents" to extract information.</p>
              </div>
            ) : editingTechnical ? (
              <div className="space-y-6">
                {/* Material Types */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-medium">Material Specifications</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTechMaterialTypes([...techMaterialTypes, { item: "", specification: "", grade: "", quantity: "" }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {techMaterialTypes.map((mat, index) => (
                      <div key={index} className="grid grid-cols-5 gap-2">
                        <Input
                          value={mat.item}
                          onChange={(e) => {
                            const newMats = [...techMaterialTypes];
                            newMats[index] = { ...newMats[index], item: e.target.value };
                            setTechMaterialTypes(newMats);
                          }}
                          placeholder="Item"
                        />
                        <Input
                          value={mat.specification}
                          onChange={(e) => {
                            const newMats = [...techMaterialTypes];
                            newMats[index] = { ...newMats[index], specification: e.target.value };
                            setTechMaterialTypes(newMats);
                          }}
                          placeholder="Specification"
                        />
                        <Input
                          value={mat.grade || ""}
                          onChange={(e) => {
                            const newMats = [...techMaterialTypes];
                            newMats[index] = { ...newMats[index], grade: e.target.value };
                            setTechMaterialTypes(newMats);
                          }}
                          placeholder="Grade"
                        />
                        <Input
                          value={mat.quantity || ""}
                          onChange={(e) => {
                            const newMats = [...techMaterialTypes];
                            newMats[index] = { ...newMats[index], quantity: e.target.value };
                            setTechMaterialTypes(newMats);
                          }}
                          placeholder="Quantity"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setTechMaterialTypes(techMaterialTypes.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Special Requirements */}
                <div>
                  <Label className="font-medium mb-2 block">Special Requirements</Label>
                  <EditableStringList
                    items={techSpecialRequirements}
                    setItems={setTechSpecialRequirements}
                    placeholder="e.g., All welding to BS EN ISO 5817 Class B"
                    icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
                  />
                </div>

                {/* Inspection Requirements */}
                <div>
                  <Label className="font-medium mb-2 block">Inspection Requirements</Label>
                  <EditableStringList
                    items={techInspectionRequirements}
                    setItems={setTechInspectionRequirements}
                    placeholder="e.g., Visual inspection at each phase completion"
                    icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
                  />
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={handleSaveTechnical} disabled={updateSection.isPending}>
                    {updateSection.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Technical Review
                  </Button>
                  <Button variant="outline" onClick={() => { resetTechnicalState(); setEditingTechnical(false); }}>
                    <X className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Material Types - View */}
                {technicalData.materialTypes && technicalData.materialTypes.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Material Specifications</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 font-medium">Item</th>
                            <th className="text-left p-2 font-medium">Specification</th>
                            <th className="text-left p-2 font-medium">Grade</th>
                            <th className="text-left p-2 font-medium">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {technicalData.materialTypes.map((mat: any, i: number) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-muted/30" : ""}>
                              <td className="p-2">{mat.item}</td>
                              <td className="p-2">{mat.specification}</td>
                              <td className="p-2">{mat.grade}</td>
                              <td className="p-2">{mat.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Special Requirements - View */}
                {technicalData.specialRequirements && technicalData.specialRequirements.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Special Requirements</h4>
                    <ul className="space-y-1">
                      {technicalData.specialRequirements.map((req: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Inspection Requirements - View */}
                {technicalData.inspectionRequirements && technicalData.inspectionRequirements.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Inspection Requirements</h4>
                    <ul className="space-y-1">
                      {technicalData.inspectionRequirements.map((req: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SITE REQUIREMENTS */}
      {/* ═══════════════════════════════════════════════════════ */}
      {hasSiteEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardHat className="h-5 w-5" />
                Site Requirements
                {siteSaved && <Check className="h-4 w-4 text-green-600" />}
              </div>
              {siteData && !editingSite && (
                <Button variant="ghost" size="sm" onClick={() => { resetSiteState(); setEditingSite(true); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Working hours, access restrictions, and safety requirements for the project site.
            </p>
          </CardHeader>
          <CardContent>
            {!siteData && !editingSite ? (
              <div className="text-center py-6 text-muted-foreground">
                <HardHat className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No site requirements data yet. Click "Populate from Tender Documents" to extract information.</p>
              </div>
            ) : editingSite ? (
              <div className="space-y-6">
                {/* Working Hours */}
                <div>
                  <Label className="font-medium mb-2 block flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Working Hours
                  </Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Start</Label>
                      <Input
                        value={siteWorkingHoursStart}
                        onChange={(e) => setSiteWorkingHoursStart(e.target.value)}
                        placeholder="e.g., 07:30"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">End</Label>
                      <Input
                        value={siteWorkingHoursEnd}
                        onChange={(e) => setSiteWorkingHoursEnd(e.target.value)}
                        placeholder="e.g., 17:00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Days</Label>
                      <Input
                        value={siteWorkingHoursDays}
                        onChange={(e) => setSiteWorkingHoursDays(e.target.value)}
                        placeholder="e.g., Monday - Friday"
                      />
                    </div>
                  </div>
                </div>

                {/* Access Restrictions */}
                <div>
                  <Label className="font-medium mb-2 block">Access Restrictions</Label>
                  <EditableStringList
                    items={siteAccessRestrictions}
                    setItems={setSiteAccessRestrictions}
                    placeholder="e.g., No vehicle access after 09:00"
                    icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
                  />
                </div>

                {/* Safety Requirements */}
                <div>
                  <Label className="font-medium mb-2 block flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Safety Requirements
                  </Label>
                  <EditableStringList
                    items={siteSafetyRequirements}
                    setItems={setSiteSafetyRequirements}
                    placeholder="e.g., CSCS cards required for all operatives"
                    icon={<Shield className="h-4 w-4 text-blue-500" />}
                  />
                </div>

                {/* Permit Needs */}
                <div>
                  <Label className="font-medium mb-2 block">Permits Required</Label>
                  <EditableStringList
                    items={sitePermitNeeds}
                    setItems={setSitePermitNeeds}
                    placeholder="e.g., Hot works permit"
                  />
                </div>

                {/* Constraints */}
                <div>
                  <Label className="font-medium mb-2 block">Site Constraints</Label>
                  <EditableStringList
                    items={siteConstraints}
                    setItems={setSiteConstraints}
                    placeholder="e.g., Limited storage space on site"
                  />
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={handleSaveSite} disabled={updateSection.isPending}>
                    {updateSection.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Site Requirements
                  </Button>
                  <Button variant="outline" onClick={() => { resetSiteState(); setEditingSite(false); }}>
                    <X className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Working Hours - View */}
                {siteData.workingHours && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Working Hours
                    </h4>
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">Hours:</span> {siteData.workingHours.start} - {siteData.workingHours.end}</p>
                      <p><span className="text-muted-foreground">Days:</span> {siteData.workingHours.days}</p>
                    </div>
                  </div>
                )}

                {/* Access Restrictions - View */}
                {siteData.accessRestrictions && siteData.accessRestrictions.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Access Restrictions</h4>
                    <ul className="space-y-1">
                      {siteData.accessRestrictions.map((restriction: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          {restriction}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Safety Requirements - View */}
                {siteData.safetyRequirements && siteData.safetyRequirements.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Safety Requirements
                    </h4>
                    <ul className="space-y-1">
                      {siteData.safetyRequirements.map((req: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Shield className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Permit Needs - View */}
                {siteData.permitNeeds && siteData.permitNeeds.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Permits Required</h4>
                    <div className="flex flex-wrap gap-2">
                      {siteData.permitNeeds.map((permit: string, i: number) => (
                        <Badge key={i} variant="secondary">{permit}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Constraints - View */}
                {siteData.constraints && siteData.constraints.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Site Constraints</h4>
                    <ul className="space-y-1">
                      {siteData.constraints.map((constraint: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-orange-500 mt-0.5">•</span> {constraint}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* QUALITY & COMPLIANCE */}
      {/* ═══════════════════════════════════════════════════════ */}
      {hasQualityEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Quality & Compliance
                {qualitySaved && <Check className="h-4 w-4 text-green-600" />}
              </div>
              {qualityData && !editingQuality && (
                <Button variant="ghost" size="sm" onClick={() => { resetQualityState(); setEditingQuality(true); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Required standards, certifications, and inspection points for quality assurance.
            </p>
          </CardHeader>
          <CardContent>
            {!qualityData && !editingQuality ? (
              <div className="text-center py-6 text-muted-foreground">
                <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No quality data yet. Click "Populate from Tender Documents" to extract information.</p>
              </div>
            ) : editingQuality ? (
              <div className="space-y-6">
                {/* Required Standards */}
                <div>
                  <Label className="font-medium mb-2 block">Required Standards</Label>
                  <EditableStringList
                    items={qualityStandards}
                    setItems={setQualityStandards}
                    placeholder="e.g., BS EN ISO 9001:2015"
                  />
                </div>

                {/* Certifications */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-medium">Certifications</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQualityCertifications([...qualityCertifications, { name: "", required: true }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {qualityCertifications.map((cert, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          value={cert.name}
                          onChange={(e) => {
                            const newCerts = [...qualityCertifications];
                            newCerts[index] = { ...newCerts[index], name: e.target.value };
                            setQualityCertifications(newCerts);
                          }}
                          placeholder="Certification name"
                          className="flex-1"
                        />
                        <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={cert.required}
                            onChange={(e) => {
                              const newCerts = [...qualityCertifications];
                              newCerts[index] = { ...newCerts[index], required: e.target.checked };
                              setQualityCertifications(newCerts);
                            }}
                            className="rounded"
                          />
                          Required
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => setQualityCertifications(qualityCertifications.filter((_, i) => i !== index))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inspection Points */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-medium">Inspection Points</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQualityInspectionPoints([...qualityInspectionPoints, { phase: "", description: "" }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {qualityInspectionPoints.map((point, index) => (
                      <div key={index} className="grid grid-cols-7 gap-2">
                        <Input
                          value={point.phase}
                          onChange={(e) => {
                            const newPoints = [...qualityInspectionPoints];
                            newPoints[index] = { ...newPoints[index], phase: e.target.value };
                            setQualityInspectionPoints(newPoints);
                          }}
                          placeholder="Phase"
                          className="col-span-2"
                        />
                        <Input
                          value={point.description}
                          onChange={(e) => {
                            const newPoints = [...qualityInspectionPoints];
                            newPoints[index] = { ...newPoints[index], description: e.target.value };
                            setQualityInspectionPoints(newPoints);
                          }}
                          placeholder="Description"
                          className="col-span-4"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setQualityInspectionPoints(qualityInspectionPoints.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={handleSaveQuality} disabled={updateSection.isPending}>
                    {updateSection.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Quality & Compliance
                  </Button>
                  <Button variant="outline" onClick={() => { resetQualityState(); setEditingQuality(false); }}>
                    <X className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Required Standards - View */}
                {qualityData.requiredStandards && qualityData.requiredStandards.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Required Standards</h4>
                    <div className="flex flex-wrap gap-2">
                      {qualityData.requiredStandards.map((std: string, i: number) => (
                        <Badge key={i} variant="secondary">{std}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Certifications - View */}
                {qualityData.certifications && qualityData.certifications.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Certifications</h4>
                    <div className="space-y-2">
                      {qualityData.certifications.map((cert: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 border rounded">
                          <span className="text-sm">{cert.name}</span>
                          <Badge variant={cert.required ? "default" : "outline"}>
                            {cert.required ? "Required" : "Optional"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inspection Points - View */}
                {qualityData.inspectionPoints && qualityData.inspectionPoints.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Inspection Points</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 font-medium">Phase</th>
                            <th className="text-left p-2 font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qualityData.inspectionPoints.map((point: any, i: number) => (
                            <tr key={i} className={i % 2 === 1 ? "bg-muted/30" : ""}>
                              <td className="p-2 font-medium">{point.phase}</td>
                              <td className="p-2">{point.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Show message if no sections are enabled */}
      {!hasSiteEnabled && !hasQualityEnabled && !hasTechnicalEnabled && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No site/quality sections are enabled for this trade preset.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
