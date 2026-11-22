import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ApiError } from "../lib/api/client";
import {
  addMember,
  listMembers,
  removeMember,
  updateMemberRole,
  type Member,
  type MemberRole,
} from "../lib/api/organizations";
import { useOrg } from "../lib/org-context";

const ROLE_OPTIONS: MemberRole[] = ["owner", "admin", "member"];

function displayName(member: Member): string {
  return member.fullName ?? member.email;
}

export function MembersPage() {
  const { selectedOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");

  const queryKey = ["members", selectedOrgId];
  const {
    data: members,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listMembers(selectedOrgId as string),
    enabled: selectedOrgId != null,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey });
  }

  const addMutation = useMutation({
    mutationFn: (newUserId: string) => addMember(selectedOrgId as string, newUserId),
    onSuccess: () => {
      setAddError(null);
      setUserId("");
      invalidate();
    },
    onError: (err) => {
      setAddError(err instanceof ApiError ? err.detail : "Something went wrong. Please try again.");
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ targetUserId, role }: { targetUserId: string; role: MemberRole }) =>
      updateMemberRole(selectedOrgId as string, targetUserId, role),
    onError: (err) => {
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
    },
    onSuccess: () => setActionError(null),
    onSettled: () => invalidate(),
  });

  const removeMutation = useMutation({
    mutationFn: (targetUserId: string) => removeMember(selectedOrgId as string, targetUserId),
    onError: (err) => {
      // A 404 here means someone else already removed this member (a
      // stale row in our list); surface it and let `onSettled` refetch so
      // the table reflects reality instead of keeping a row we just acted
      // on, same pattern as `ServicesListPage`/`IncidentsListPage`.
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
    },
    onSuccess: () => setActionError(null),
    onSettled: () => invalidate(),
  });

  function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrgId || userId.trim().length === 0) return;
    addMutation.mutate(userId.trim());
  }

  function handleRoleChange(member: Member, role: MemberRole) {
    if (!selectedOrgId || role === member.role) return;
    roleMutation.mutate({ targetUserId: member.userId, role });
  }

  function handleRemove(member: Member) {
    if (!selectedOrgId) return;
    removeMutation.mutate(member.userId);
  }

  if (!selectedOrgId) {
    return <p className="text-sm text-ink">Select an organization to view its members.</p>;
  }

  const items = members ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-ink">Members</h2>
      </div>

      <form onSubmit={handleAddSubmit} className="flex items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="member-user-id" className="block text-sm text-ink">
            User ID
          </label>
          <input
            id="member-user-id"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="rounded border border-hairline bg-bg px-3 py-2 font-mono text-ink"
          />
        </div>
        <button
          type="submit"
          disabled={addMutation.isPending || userId.trim().length === 0}
          className="rounded bg-accent-blue px-3 py-2 text-sm text-ink disabled:opacity-60"
        >
          Add member
        </button>
      </form>

      {addError && <p className="text-sm text-critical">{addError}</p>}
      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      {isLoading && <p className="text-sm text-ink">Loading members...</p>}

      {isError && !isLoading && (
        <div className="space-y-2">
          <p className="text-sm text-critical">Failed to load members.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded border border-hairline px-3 py-2 text-sm text-ink"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <p className="text-sm text-ink">No members yet. Add one by user ID to get started.</p>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <table className="w-full border-collapse text-sm text-ink">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">User ID</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Joined</th>
              <th className="py-2 pr-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((member) => {
              const name = displayName(member);
              return (
                <tr key={member.id} className="border-b border-hairline">
                  <td className="py-2 pr-4">{name}</td>
                  <td className="py-2 pr-4 font-mono">{member.userId}</td>
                  <td className="py-2 pr-4">
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        handleRoleChange(member, (value ?? member.role) as MemberRole)
                      }
                    >
                      <SelectTrigger
                        aria-label={`Role for ${name}`}
                        className="rounded border border-hairline bg-surface px-2 py-1 text-sm text-ink"
                      >
                        <SelectValue>{(value: string) => value}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded border border-hairline bg-surface text-ink">
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem
                            key={role}
                            value={role}
                            className="text-ink focus:bg-bg focus:text-ink"
                          >
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 pr-4 font-mono">{member.createdAt}</td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      className="rounded border border-hairline px-2 py-1 text-xs text-critical"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default MembersPage;
