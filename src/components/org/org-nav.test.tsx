import { fireEvent, render, screen, within } from "@testing-library/react";
import { OrgNavigation } from "./org-nav";
import { SidebarSlot } from "@/components/sidebar-slot";
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

  it("lists the Settings pages only while Settings is open (D-188)", () => {
    const { rerender } = render(<OrgNavigation nav={nav} value="members" onChange={vi.fn()} />);
    const side = screen.getByRole("navigation", { name: "Organization" });
    expect(within(side).queryByRole("list", { name: "Settings" })).toBeNull();
    expect(within(side).queryByRole("button", { name: "Roles" })).toBeNull();
    expect(within(side).getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    rerender(<OrgNavigation nav={nav} value="settings" onChange={vi.fn()} />);
    expect(within(side).getByRole("list", { name: "Settings" })).toBeInTheDocument();
    expect(within(side).getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("puts the menu into the app's sidebar when there is one (D-205)", () => {
    const sidebar = document.createElement("div");
    sidebar.setAttribute("data-testid", "sidebar");
    document.body.appendChild(sidebar);
    const { container } = render(
      <SidebarSlot.Provider value={sidebar}>
        <OrgNavigation nav={nav} value="overview" onChange={vi.fn()} />
      </SidebarSlot.Provider>,
    );
    // the desktop menu lives in the sidebar, not in the page; the phone dropdown stays in the page
    expect(within(sidebar).getByRole("navigation", { name: "Organization" })).toBeInTheDocument();
    expect(container.querySelector("nav")).toBeNull();
    expect(within(container).getByRole("combobox", { name: "Section" })).toBeInTheDocument();
    sidebar.remove();
  });
});
