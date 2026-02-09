import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const siteData = config?.sections?.siteRequirements?.data;
  const qualityData = config?.sections?.qualityCompliance?.data;
  const technicalData = config?.sections?.technicalReview?.data;
  const hasSiteEnabled = config?.sections?.siteRequirements?.enabled;
  const hasQualityEnabled = config?.sections?.qualityCompliance?.enabled;
  const hasTechnicalEnabled = config?.sections?.technicalReview?.enabled;

  const hasAnyData = siteData || qualityData || technicalData;

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

      {/* Technical Review */}
      {hasTechnicalEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Technical Review
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Material specifications, special requirements, and inspection points extracted from tender documents.
            </p>
          </CardHeader>
          <CardContent>
            {!technicalData ? (
              <div className="text-center py-6 text-muted-foreground">
                <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No technical review data yet. Click "Populate from Tender Documents" to extract information.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Material Types */}
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

                {/* Special Requirements */}
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

                {/* Inspection Requirements */}
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

      {/* Site Requirements */}
      {hasSiteEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5" />
              Site Requirements
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Working hours, access restrictions, and safety requirements for the project site.
            </p>
          </CardHeader>
          <CardContent>
            {!siteData ? (
              <div className="text-center py-6 text-muted-foreground">
                <HardHat className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No site requirements data yet. Click "Populate from Tender Documents" to extract information.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Working Hours */}
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

                {/* Access Restrictions */}
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

                {/* Safety Requirements */}
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
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quality & Compliance */}
      {hasQualityEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Quality & Compliance
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Required standards, certifications, and inspection points for quality assurance.
            </p>
          </CardHeader>
          <CardContent>
            {!qualityData ? (
              <div className="text-center py-6 text-muted-foreground">
                <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No quality data yet. Click "Populate from Tender Documents" to extract information.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Required Standards */}
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

                {/* Certifications */}
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

                {/* Inspection Points */}
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
