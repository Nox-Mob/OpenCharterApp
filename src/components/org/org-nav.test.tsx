import { fireEvent, render, screen, within } from "@testing-library/react";
import { OrgNavigation } from "./org-nav";
import { buildOrgNav } from "./org-nav-items";

const nav = buildOrgNav({
  canSeeMembers: true,
  canSeeReports: true,
  hasChapters: true,
  isChapter: false,
  canManage: true,
  canRunSetup: true,
  canManageLevels: true,
  canManageFields: true,
  canManageRoles: true,
  canConfigureBoard: true,
  canSeePayments: true,
  canAudit: true,
});

describe("OrgNavigation", () => {
  it("nests the admin pages under Settings and marks the open page", () => {
    const onChange = vi.fn();
    render(<OrgNavigation nav={nav} value="roles" onChange={onChange} />);
    const side = screen.getByRole("navigation", { name: "Organization" });
    const settings = within(side).getByRole("list", { name: "Settings" });
    expect(within(settings).getByRole("button", { name: "Roles" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(settings).getByRole("button", { name: "Setup" })).toBeInTheDocument();
    fireEvent.click(within(side).getByRole("button", { name: "Reports" }));
    expect(onChange).toHaveBeenCalledWith("reports");
    fireEvent.click(within(side).getByRole("button", { name: "Settings" }));
    expect(onChange).toHaveBeenLastCalledWith("settings");
  });
});
