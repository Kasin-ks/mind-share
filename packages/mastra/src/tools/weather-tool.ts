import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const weatherTool = createTool({
	id: "get-weather",
	description: "Get current weather information for a location",
	inputSchema: z.object({
		location: z
			.string()
			.describe("The city and country, e.g. San Francisco, CA"),
	}),
	outputSchema: z.object({
		location: z.string(),
		temperature: z.number(),
		conditions: z.string(),
		humidity: z.number(),
		windSpeed: z.number(),
	}),
	execute: async ({ location }: { location: string }) => {
		// Mock weather data - replace with actual API call in production
		const mockWeatherData: Record<
			string,
			{
				location: string;
				temperature: number;
				conditions: string;
				humidity: number;
				windSpeed: number;
			}
		> = {
			"San Francisco, CA": {
				location: "San Francisco, CA",
				temperature: 18,
				conditions: "Partly cloudy",
				humidity: 65,
				windSpeed: 12,
			},
			"New York, NY": {
				location: "New York, NY",
				temperature: 22,
				conditions: "Sunny",
				humidity: 55,
				windSpeed: 8,
			},
			"London, UK": {
				location: "London, UK",
				temperature: 15,
				conditions: "Rainy",
				humidity: 80,
				windSpeed: 15,
			},
		};

		const weather = mockWeatherData[location] || {
			location,
			temperature: 20,
			conditions: "Clear",
			humidity: 60,
			windSpeed: 10,
		};

		return weather;
	},
});
