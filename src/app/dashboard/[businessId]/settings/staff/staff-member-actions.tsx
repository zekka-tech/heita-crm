"use client";

import { useState, useTransition } from "react";
import { StaffRole } from "@/types/enums";

import {
  removeStaffMemberAction,
  updateStaffRoleAction
} from "@/app/dashboard/[businessId]/settings/staff/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  businessId: string;
  targetUserId: string;
  currentRole: StaffRole;
  name: string;
};

const ROLE_OPTIONS = Object.values(StaffRole).filter((r) => r !== StaffRole.OWNER);

export function StaffMemberActions({ businessId, targetUserId, currentRole, name }: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [changeRole, setChangeRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole>(currentRole);
  const [isPending, startTransition] = useTransition();

  const handleRemove = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("businessId", businessId);
      fd.set("targetUserId", targetUserId);
      await removeStaffMemberAction(fd);
    });
  };

  const handleRoleChange = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("businessId", businessId);
      fd.set("targetUserId", targetUserId);
      fd.set("newRole", selectedRole);
      await updateStaffRoleAction(fd);
      setChangeRole(false);
    });
  };

  return (
    <>
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${name}?`}
        description="They will lose access to the dashboard immediately. This action cannot be undone."
        confirmLabel="Remove"
        destructive
        isPending={isPending}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(false)}
      />

      <ConfirmDialog
        open={changeRole}
        title={`Change role for ${name}?`}
        description={`Set role to ${selectedRole}.`}
        confirmLabel="Update role"
        isPending={isPending}
        onConfirm={handleRoleChange}
        onCancel={() => setChangeRole(false)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as StaffRole)}
          disabled={currentRole === StaffRole.OWNER}
          aria-label="New role"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {currentRole !== StaffRole.OWNER && selectedRole !== currentRole ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setChangeRole(true)}
            disabled={isPending}
          >
            Change role
          </Button>
        ) : null}
        {currentRole !== StaffRole.OWNER ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setConfirmRemove(true)}
            disabled={isPending}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </>
  );
}
