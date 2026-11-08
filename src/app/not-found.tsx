import { DishIcon } from "@/components/brand/DishIcon";
import { ProblemPage } from "@/components/layout/ProblemPage";
import { ButtonLink } from "@/components/ui/button-link";

export default function NotFound() {
  return (
    <ProblemPage
      icon={<DishIcon name="plate" size={32} />}
      title="This page is not on the menu"
      text="The link may be old, or the restaurant moved. Start from a city and find the dish, or rate one you had."
    >
      <ButtonLink href="/">Back to the start</ButtonLink>
      <ButtonLink variant="outline" href="/rate">
        Rate a dish
      </ButtonLink>
    </ProblemPage>
  );
}
