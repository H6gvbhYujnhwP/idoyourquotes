import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Save,
  X,
  Trash2,
  Plus,
  Users,
  Wrench,
  Package,
  AlertTriangle,
  Loader2,
  GripVertical,
} from "lucide-react";

interface TimelinePhase {
  id: string;
  name: string;
  description: string;
  duration: { value: number; unit: string };
  dependencies?: string[];
  resources?: {
    manpower?: string;
    equipment?: string[];
    materials?: string[];
  };
  costBreakdown?: {
    labour?: number;
    materials?: number;
    equipment?: number;
    total: number;
  };
  riskFactors?: string[];
  status?: string;
}

interface EditableTimelinePhaseProps {
  phase: TimelinePhase;
  phaseNumber: number;
  onSave: (updatedPhase: TimelinePhase) => Promise<void>;
  onDelete: (phaseId: string) => Promise<void>;
}

export function EditableTimelinePhase({
  phase,
  phaseNumber,
  onSave,
  onDelete,
}: EditableTimelinePhaseProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedPhase, setEditedPhase] = useState<TimelinePhase>({ ...phase });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedPhase);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save phase:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedPhase({ ...phase });
    setIsEditing(false);
  };

  const addDependency = () => {
    setEditedPhase({
      ...editedPhase,
      dependencies: [...(editedPhase.dependencies || []), ""],
    });
  };

  const updateDependency = (index: number, value: string) => {
    const newDeps = [...(editedPhase.dependencies || [])];
    newDeps[index] = value;
    setEditedPhase({ ...editedPhase, dependencies: newDeps });
  };

  const removeDependency = (index: number) => {
    const newDeps = (editedPhase.dependencies || []).filter((_, i) => i !== index);
    setEditedPhase({ ...editedPhase, dependencies: newDeps });
  };

  const addRiskFactor = () => {
    setEditedPhase({
      ...editedPhase,
      riskFactors: [...(editedPhase.riskFactors || []), ""],
    });
  };

  const updateRiskFactor = (index: number, value: string) => {
    const newRisks = [...(editedPhase.riskFactors || [])];
    newRisks[index] = value;
    setEditedPhase({ ...editedPhase, riskFactors: newRisks });
  };

  const removeRiskFactor = (index: number) => {
    const newRisks = (editedPhase.riskFactors || []).filter((_, i) => i !== index);
    setEditedPhase({ ...editedPhase, riskFactors: newRisks });
  };

  const addEquipment = () => {
    setEditedPhase({
      ...editedPhase,
      resources: {
        ...editedPhase.resources,
        equipment: [...(editedPhase.resources?.equipment || []), ""],
      },
    });
  };

  const updateEquipment = (index: number, value: string) => {
    const newEquip = [...(editedPhase.resources?.equipment || [])];
    newEquip[index] = value;
    setEditedPhase({
      ...editedPhase,
      resources: { ...editedPhase.resources, equipment: newEquip },
    });
  };

  const removeEquipment = (index: number) => {
    const newEquip = (editedPhase.resources?.equipment || []).filter((_, i) => i !== index);
    setEditedPhase({
      ...editedPhase,
      resources: { ...editedPhase.resources, equipment: newEquip },
    });
  };

  const addMaterial = () => {
    setEditedPhase({
      ...editedPhase,
      resources: {
        ...editedPhase.resources,
        materials: [...(editedPhase.resources?.materials || []), ""],
      },
    });
  };

  const updateMaterial = (index: number, value: string) => {
    const newMats = [...(editedPhase.resources?.materials || [])];
    newMats[index] = value;
    setEditedPhase({
      ...editedPhase,
      resources: { ...editedPhase.resources, materials: newMats },
    });
  };

  const removeMaterial = (index: number) => {
    const newMats = (editedPhase.resources?.materials || []).filter((_, i) => i !== index);
    setEditedPhase({
      ...editedPhase,
      resources: { ...editedPhase.resources, materials: newMats },
    });
  };

  // VIEW MODE
  if (!isEditing) {
    return (
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-2">
              <GripVertical className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-lg">
                  Phase {phaseNumber}: {phase.name}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline">
                {phase.duration?.value} {phase.duration?.unit}
              </Badge>
              {phase.costBreakdown?.total != null && phase.costBreakdown.total > 0 && (
                <Badge variant="secondary">
                  £{phase.costBreakdown.total.toLocaleString()}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(phase.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* Resources */}
            {phase.resources && (phase.resources.manpower || (phase.resources.equipment && phase.resources.equipment.length > 0) || (phase.resources.materials && phase.resources.materials.length > 0)) && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Resources
                </h5>
                {phase.resources.manpower && (
                  <p className="text-sm text-muted-foreground">{phase.resources.manpower}</p>
                )}
                {phase.resources.equipment && phase.resources.equipment.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {phase.resources.equipment.map((eq, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        <Wrench className="h-3 w-3 mr-1" />{eq}
                      </Badge>
                    ))}
                  </div>
                )}
                {phase.resources.materials && phase.resources.materials.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {phase.resources.materials.map((mat, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Package className="h-3 w-3 mr-1" />{mat}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cost Breakdown */}
            {phase.costBreakdown && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">Cost Breakdown</h5>
                <div className="text-sm space-y-1">
                  {phase.costBreakdown.labour != null && phase.costBreakdown.labour > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Labour</span>
                      <span>£{phase.costBreakdown.labour.toLocaleString()}</span>
                    </div>
                  )}
                  {phase.costBreakdown.materials != null && phase.costBreakdown.materials > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Materials</span>
                      <span>£{phase.costBreakdown.materials.toLocaleString()}</span>
                    </div>
                  )}
                  {phase.costBreakdown.equipment != null && phase.costBreakdown.equipment > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Equipment</span>
                      <span>£{phase.costBreakdown.equipment.toLocaleString()}</span>
                    </div>
                  )}
                  {phase.costBreakdown.total != null && (
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Phase Total</span>
                      <span>£{phase.costBreakdown.total.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Risk Factors & Dependencies */}
            <div className="space-y-3">
              {phase.dependencies && phase.dependencies.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-medium">Prerequisites</h5>
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {phase.dependencies.map((dep, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-blue-500 mt-0.5">•</span> {dep}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {phase.riskFactors && phase.riskFactors.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Risk Factors
                  </h5>
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {phase.riskFactors.map((risk, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-amber-500 mt-0.5">•</span> {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // EDIT MODE
  return (
    <Card className="border-l-4 border-l-purple-500 shadow-lg ring-1 ring-purple-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Pencil className="h-5 w-5 text-purple-600" />
          Editing Phase {phaseNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name & Duration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Phase Name</Label>
            <Input
              value={editedPhase.name}
              onChange={(e) => setEditedPhase({ ...editedPhase, name: e.target.value })}
              placeholder="e.g., Discovery & Audit"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Duration</Label>
              <Input
                type="number"
                min="1"
                value={editedPhase.duration?.value || ""}
                onChange={(e) =>
                  setEditedPhase({
                    ...editedPhase,
                    duration: {
                      ...editedPhase.duration,
                      value: parseInt(e.target.value) || 0,
                      unit: editedPhase.duration?.unit || "weeks",
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>Unit</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={editedPhase.duration?.unit || "weeks"}
                onChange={(e) =>
                  setEditedPhase({
                    ...editedPhase,
                    duration: {
                      ...editedPhase.duration,
                      value: editedPhase.duration?.value || 1,
                      unit: e.target.value,
                    },
                  })
                }
              >
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <Label>Description</Label>
          <Textarea
            value={editedPhase.description}
            onChange={(e) => setEditedPhase({ ...editedPhase, description: e.target.value })}
            rows={3}
            placeholder="Detailed description of this phase..."
          />
        </div>

        {/* Resources */}
        <div>
          <Label>Resources / Team</Label>
          <Input
            value={editedPhase.resources?.manpower || ""}
            onChange={(e) =>
              setEditedPhase({
                ...editedPhase,
                resources: { ...editedPhase.resources, manpower: e.target.value },
              })
            }
            placeholder="e.g., 1 Senior Engineer, 1 Technician"
          />
        </div>

        {/* Equipment */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="flex items-center gap-1">
              <Wrench className="h-3.5 w-3.5" /> Equipment
            </Label>
            <Button variant="outline" size="sm" onClick={addEquipment}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {(editedPhase.resources?.equipment || []).map((eq, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                value={eq}
                onChange={(e) => updateEquipment(index, e.target.value)}
                placeholder="e.g., Cable tester"
              />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeEquipment(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Materials */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> Materials
            </Label>
            <Button variant="outline" size="sm" onClick={addMaterial}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {(editedPhase.resources?.materials || []).map((mat, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                value={mat}
                onChange={(e) => updateMaterial(index, e.target.value)}
                placeholder="e.g., Cat6a cable"
              />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeMaterial(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Cost Breakdown */}
        <div>
          <Label className="mb-2 block">Cost Breakdown</Label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Labour (£)</Label>
              <Input
                type="number"
                min="0"
                value={editedPhase.costBreakdown?.labour ?? ""}
                onChange={(e) => {
                  const labour = parseFloat(e.target.value) || 0;
                  const materials = editedPhase.costBreakdown?.materials || 0;
                  const equipment = editedPhase.costBreakdown?.equipment || 0;
                  setEditedPhase({
                    ...editedPhase,
                    costBreakdown: {
                      labour,
                      materials,
                      equipment,
                      total: labour + materials + equipment,
                    },
                  });
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Materials (£)</Label>
              <Input
                type="number"
                min="0"
                value={editedPhase.costBreakdown?.materials ?? ""}
                onChange={(e) => {
                  const materials = parseFloat(e.target.value) || 0;
                  const labour = editedPhase.costBreakdown?.labour || 0;
                  const equipment = editedPhase.costBreakdown?.equipment || 0;
                  setEditedPhase({
                    ...editedPhase,
                    costBreakdown: {
                      labour,
                      materials,
                      equipment,
                      total: labour + materials + equipment,
                    },
                  });
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Equipment (£)</Label>
              <Input
                type="number"
                min="0"
                value={editedPhase.costBreakdown?.equipment ?? ""}
                onChange={(e) => {
                  const equipment = parseFloat(e.target.value) || 0;
                  const labour = editedPhase.costBreakdown?.labour || 0;
                  const materials = editedPhase.costBreakdown?.materials || 0;
                  setEditedPhase({
                    ...editedPhase,
                    costBreakdown: {
                      labour,
                      materials,
                      equipment,
                      total: labour + materials + equipment,
                    },
                  });
                }}
              />
            </div>
          </div>
          {editedPhase.costBreakdown && (
            <div className="mt-2 text-sm font-medium text-right">
              Phase Total: £{(editedPhase.costBreakdown.total || 0).toLocaleString()}
            </div>
          )}
        </div>

        {/* Dependencies */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Prerequisites / Dependencies</Label>
            <Button variant="outline" size="sm" onClick={addDependency}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {(editedPhase.dependencies || []).map((dep, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                value={dep}
                onChange={(e) => updateDependency(index, e.target.value)}
                placeholder="e.g., Network access confirmed"
              />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeDependency(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Risk Factors */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Risk Factors
            </Label>
            <Button variant="outline" size="sm" onClick={addRiskFactor}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {(editedPhase.riskFactors || []).map((risk, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                value={risk}
                onChange={(e) => updateRiskFactor(index, e.target.value)}
                placeholder="e.g., Timeline depends on hardware delivery"
              />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeRiskFactor(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isSaving ? "Saving..." : "Save Phase"}
          </Button>
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
